"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";
import { getMealSheet, getPobAsOf, getRoomHistory, searchBedAvailability } from "@/lib/offshore";
import type { MealEntry, PobAsOf, RoomAvailability, RoomHistoryRow } from "@/types/offshore";

export interface ActionResult {
  ok: boolean;
  error?: string;
}
const rev = () => revalidatePath("/offshore");
async function admin() {
  return isAdminRole(await getCurrentRole());
}

export async function requestOffshoreTrip(input: {
  installationId: string;
  mobilizeDate: string;
  demobDate?: string;
}): Promise<ActionResult> {
  if (!input.mobilizeDate) return { ok: false, error: "Mobilise date is required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("offshore_trips").insert({
    tenant_id: tenant.id,
    installation_id: input.installationId || null,
    mobilize_date: input.mobilizeDate,
    demob_date: input.demobDate || null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function clearHse(id: string): Promise<ActionResult> {
  if (!(await admin())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("offshore_trips")
    .update({
      status: "hse_cleared",
      hse_cleared_at: new Date().toISOString(),
      hse_cleared_by: user?.id ?? null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function assignManifest(
  id: string,
  flightId: string | null,
  bedNo: string | null,
): Promise<ActionResult> {
  if (!(await admin())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase
    .from("offshore_trips")
    .update({ flight_id: flightId, bed_no: bedNo, status: "manifested" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
  rev();
  return { ok: true };
}

export async function setOffshoreStatus(
  id: string,
  status: "onboard" | "demobilised" | "cancelled",
): Promise<ActionResult> {
  if (!(await admin())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase.from("offshore_trips").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
  rev();
  return { ok: true };
}

export async function addFlight(input: {
  flightDate: string;
  route: string;
  seats: number;
}): Promise<ActionResult> {
  if (!(await admin())) return { ok: false, error: "Not authorized." };
  if (!input.route.trim() || !input.flightDate)
    return { ok: false, error: "Route and date are required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("helicopter_flights").insert({
    tenant_id: tenant.id,
    flight_date: input.flightDate,
    route: input.route.trim(),
    seats: Math.max(1, Math.floor(input.seats || 12)),
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// --- Crew change, roster & accommodation management --------------------------

/** Offshore setup is managed by tenant admins and safety admins. */
async function canManageOffshore(): Promise<boolean> {
  const a = await getAccess();
  return a.isAdmin || a.isSafetyAdmin;
}

async function tenantId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function upsertCrew(input: {
  id?: string;
  name: string;
  installationId?: string;
  rotationPattern?: string;
  offshoreDays?: number;
  onshoreDays?: number;
  transportMode?: string;
  departureLocation?: string;
  cycleStartDate?: string | null;
}): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!input.name.trim()) return { ok: false, error: "Crew name is required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const row: Record<string, unknown> = {
    tenant_id: tenant,
    name: input.name.trim(),
    installation_id: input.installationId || null,
    rotation_pattern: input.rotationPattern?.trim() || null,
    offshore_days: Math.max(1, Math.floor(input.offshoreDays || 14)),
    onshore_days: Math.max(1, Math.floor(input.onshoreDays || 14)),
    transport_mode: input.transportMode?.trim() || null,
    departure_location: input.departureLocation?.trim() || null,
  };
  if (input.cycleStartDate !== undefined) row.cycle_start_date = input.cycleStartDate || null;
  const { error } = input.id
    ? await supabase.from("offshore_crews").update(row).eq("id", input.id)
    : await supabase.from("offshore_crews").insert(row);
  if (error)
    return {
      ok: false,
      error: error.message.includes("duplicate") ? "A crew with that name exists." : error.message,
    };
  rev();
  return { ok: true };
}

export async function deleteCrew(id: string): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase.from("offshore_crews").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function upsertRoom(input: {
  id?: string;
  installationId: string;
  block?: string;
  floor?: string;
  roomNumber: string;
  roomType?: string;
  bedCount?: number;
  maxBedCount?: number;
  genderRestriction?: string;
  status?: string;
  specialFlag?: string;
  notes?: string;
}): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!input.installationId) return { ok: false, error: "Installation is required." };
  if (!input.roomNumber.trim()) return { ok: false, error: "Room number is required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const bed = Math.max(0, Math.floor(input.bedCount ?? 1));
  const row = {
    tenant_id: tenant,
    installation_id: input.installationId,
    block: input.block?.trim() || null,
    floor: input.floor?.trim() || null,
    room_number: input.roomNumber.trim(),
    room_type: input.roomType?.trim() || "shared",
    bed_count: bed,
    max_bed_count: Math.max(bed, Math.floor(input.maxBedCount ?? bed)),
    gender_restriction: ["any", "male", "female"].includes(input.genderRestriction ?? "")
      ? input.genderRestriction
      : "any",
    status: input.status || "available",
    special_flag: input.specialFlag?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  const { error } = input.id
    ? await supabase.from("offshore_rooms").update(row).eq("id", input.id)
    : await supabase.from("offshore_rooms").insert(row);
  if (error)
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "That room number already exists on this installation."
        : error.message,
    };
  rev();
  return { ok: true };
}

export async function setRoomStatus(id: string, status: string): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase.from("offshore_rooms").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Inline edit of one or more room fields (only provided fields change). */
export async function updateRoomFields(input: {
  id: string;
  block?: string;
  floor?: string;
  roomNumber?: string;
  roomType?: string;
  bedCount?: number;
  maxBedCount?: number;
  genderRestriction?: string;
  specialFlag?: string;
  notes?: string;
}): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (input.block !== undefined) patch.block = input.block.trim() || null;
  if (input.floor !== undefined) patch.floor = input.floor.trim() || null;
  if (input.roomNumber !== undefined) {
    if (!input.roomNumber.trim()) return { ok: false, error: "Room number can't be empty." };
    patch.room_number = input.roomNumber.trim();
  }
  if (input.roomType !== undefined) patch.room_type = input.roomType.trim() || "shared";
  if (input.bedCount !== undefined) {
    const bed = Math.max(0, Math.floor(input.bedCount));
    patch.bed_count = bed;
    // Keep max capacity at least the current bed count.
    if (input.maxBedCount === undefined) patch.max_bed_count = bed;
  }
  if (input.maxBedCount !== undefined) patch.max_bed_count = Math.max(0, Math.floor(input.maxBedCount));
  if (input.genderRestriction !== undefined)
    patch.gender_restriction = ["any", "male", "female"].includes(input.genderRestriction)
      ? input.genderRestriction
      : "any";
  if (input.specialFlag !== undefined) patch.special_flag = input.specialFlag.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes.trim() || null;

  const { error } = await supabase.from("offshore_rooms").update(patch).eq("id", input.id);
  if (error)
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "That room number already exists on this installation."
        : error.message,
    };
  rev();
  return { ok: true };
}

export async function addRosterMember(profileId: string): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!profileId) return { ok: false, error: "Choose a person." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase
    .from("offshore_staff")
    .insert({ tenant_id: tenant, profile_id: profileId });
  if (error && !error.message.includes("duplicate")) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function removeRosterMember(id: string): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase.from("offshore_staff").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function updateRosterMember(input: {
  id: string;
  crewId?: string | null;
  position?: string;
  company?: string;
  backToBackId?: string | null;
  fixedRoomId?: string | null;
  fixedBed?: string;
  medicalExpiry?: string | null;
  bosietExpiry?: string | null;
  huetExpiry?: string | null;
  emergencyContact?: string;
  travelEligible?: boolean;
}): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (input.crewId !== undefined) patch.crew_id = input.crewId || null;
  if (input.position !== undefined) patch.position = input.position.trim() || null;
  if (input.company !== undefined) patch.company = input.company.trim() || null;
  if (input.backToBackId !== undefined) patch.back_to_back_id = input.backToBackId || null;
  if (input.fixedRoomId !== undefined) patch.fixed_room_id = input.fixedRoomId || null;
  if (input.fixedBed !== undefined) patch.fixed_bed = input.fixedBed.trim() || null;
  if (input.medicalExpiry !== undefined) patch.medical_expiry = input.medicalExpiry || null;
  if (input.bosietExpiry !== undefined) patch.bosiet_expiry = input.bosietExpiry || null;
  if (input.huetExpiry !== undefined) patch.huet_expiry = input.huetExpiry || null;
  if (input.emergencyContact !== undefined)
    patch.emergency_contact = input.emergencyContact.trim() || null;
  if (input.travelEligible !== undefined) patch.travel_eligible = input.travelEligible;

  const { error } = await supabase.from("offshore_staff").update(patch).eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// --- Visitor offshore requests & accommodation allocation (Phase 2) ----------

const VISITOR_TYPES = ["employee", "contractor", "vendor", "auditor", "regulator", "client", "management"];

export async function createVisitRequest(input: {
  visitorName: string;
  visitorCompany?: string;
  visitorType?: string;
  gender?: string;
  hostDepartment?: string;
  hostName?: string;
  purpose?: string;
  installationId?: string;
  departDate: string;
  returnDate?: string;
  overnight?: boolean;
  emergencyContact?: string;
}): Promise<ActionResult> {
  if (!input.visitorName.trim()) return { ok: false, error: "Visitor name is required." };
  if (!input.departDate) return { ok: false, error: "Departure date is required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const overnight = input.overnight ?? true;
  const { error } = await supabase.from("offshore_visit_requests").insert({
    tenant_id: tenant,
    visitor_name: input.visitorName.trim(),
    visitor_company: input.visitorCompany?.trim() || null,
    visitor_type: VISITOR_TYPES.includes(input.visitorType ?? "") ? input.visitorType : "employee",
    gender: ["any", "male", "female"].includes(input.gender ?? "") ? input.gender : "any",
    host_department: input.hostDepartment?.trim() || null,
    host_name: input.hostName?.trim() || null,
    purpose: input.purpose?.trim() || null,
    installation_id: input.installationId || null,
    depart_date: input.departDate,
    return_date: input.returnDate || null,
    overnight,
    accommodation_required: overnight,
    emergency_contact: input.emergencyContact?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function decideVisitRequest(
  id: string,
  decision: "approved" | "rejected",
  reason?: string,
): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("offshore_visit_requests")
    .update({
      status: decision,
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      reject_reason: decision === "rejected" ? reason?.trim() || "Not approved" : null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Server-action wrapper so the client can query live bed availability. */
export async function findAvailableBeds(input: {
  installationId: string;
  from: string;
  to: string;
  gender?: string;
}): Promise<{ ok: boolean; error?: string; rooms?: RoomAvailability[] }> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!input.installationId || !input.from || !input.to)
    return { ok: false, error: "Installation and dates are required." };
  const rooms = await searchBedAvailability(input);
  return { ok: true, rooms };
}

/** Allocate a visitor to a room, re-checking availability to avoid a race. */
export async function allocateVisitorBed(input: {
  visitRequestId: string;
  roomId: string;
}): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { data: visit } = await supabase
    .from("offshore_visit_requests")
    .select("visitor_name, gender, installation_id, depart_date, return_date")
    .eq("id", input.visitRequestId)
    .maybeSingle();
  if (!visit) return { ok: false, error: "Visit request not found." };
  if (!visit.installation_id) return { ok: false, error: "Set the destination installation first." };

  const from = visit.depart_date as string;
  const to = (visit.return_date as string) || from;
  const available = await searchBedAvailability({
    installationId: visit.installation_id as string,
    from,
    to,
    gender: visit.gender as string,
  });
  if (!available.some((r) => r.room_id === input.roomId)) {
    return { ok: false, error: "That room has no free bed for the full stay — refresh availability." };
  }

  // Replace any prior active allocation for this request.
  await supabase
    .from("offshore_bed_allocations")
    .delete()
    .eq("visit_request_id", input.visitRequestId)
    .neq("status", "checked_out");

  const { error } = await supabase.from("offshore_bed_allocations").insert({
    tenant_id: tenant,
    room_id: input.roomId,
    visit_request_id: input.visitRequestId,
    occupant_name: visit.visitor_name,
    from_date: from,
    to_date: to,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Confirm offshore arrival (POB up) or onshore return (POB down, bed freed). */
export async function setVisitorMovement(
  id: string,
  movement: "onboard" | "returned",
): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase
    .from("offshore_visit_requests")
    .update({ status: movement })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Sync the bed allocation lifecycle with the movement.
  await supabase
    .from("offshore_bed_allocations")
    .update({ status: movement === "onboard" ? "checked_in" : "checked_out" })
    .eq("visit_request_id", id)
    .neq("status", "checked_out");

  rev();
  return { ok: true };
}

// --- Trip manifests (Phase 3) ------------------------------------------------

/**
 * Generate the crew manifest for the crew's *next* computed change date,
 * derived from its rotation cycle. Outbound = crew going offshore.
 */
export async function generateNextCrewChange(
  crewId: string,
  direction: "out" | "in",
): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { data: crew } = await supabase
    .from("offshore_crews")
    .select("offshore_days, onshore_days, cycle_start_date")
    .eq("id", crewId)
    .maybeSingle();
  if (!crew) return { ok: false, error: "Crew not found." };
  if (!crew.cycle_start_date)
    return { ok: false, error: "Set the crew's cycle start date first." };

  const period = (crew.offshore_days as number) + (crew.onshore_days as number);
  const DAY = 86_400_000;
  const start = new Date((crew.cycle_start_date as string) + "T00:00:00Z").getTime();
  const now = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  let base = start;
  if (now > start) base = start + Math.ceil((now - start) / (period * DAY)) * period * DAY;
  // Inbound (crew returning) falls offshore_days after they went out.
  const target =
    direction === "in" ? base - (crew.onshore_days as number) * DAY : base;
  const scheduledDate = new Date(target).toISOString().slice(0, 10);
  return generateCrewManifest({ crewId, direction, scheduledDate });
}

export async function generateCrewManifest(input: {
  crewId: string;
  direction: "out" | "in";
  scheduledDate: string;
}): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!input.scheduledDate) return { ok: false, error: "Scheduled date is required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { data: crew } = await supabase
    .from("offshore_crews")
    .select("name, installation_id, transport_mode")
    .eq("id", input.crewId)
    .maybeSingle();
  if (!crew) return { ok: false, error: "Crew not found." };

  const { data: members } = await supabase
    .from("offshore_staff")
    .select("profile_id, position, profile:profiles!offshore_staff_profile_id_fkey(full_name, email)")
    .eq("crew_id", input.crewId);
  if (!members || members.length === 0) return { ok: false, error: "This crew has no members." };

  const { data: manifest, error } = await supabase
    .from("offshore_manifests")
    .insert({
      tenant_id: tenant,
      title: `${crew.name} · ${input.direction === "out" ? "outbound" : "inbound"} · ${input.scheduledDate}`,
      crew_id: input.crewId,
      installation_id: crew.installation_id,
      trip_type: input.direction === "out" ? "crew_change_out" : "crew_change_in",
      direction: input.direction,
      transport_mode: crew.transport_mode,
      // Size the manifest to the whole crew (a crew change may span several
      // transport runs); keep at least a helicopter's 12.
      seat_capacity: Math.max(12, members.length),
      scheduled_date: input.scheduledDate,
    })
    .select("id")
    .maybeSingle();
  if (error || !manifest) return { ok: false, error: error?.message ?? "Could not create manifest." };

  const pax = members.map((m: Record<string, any>) => {
    const p = Array.isArray(m.profile) ? m.profile[0] : m.profile;
    return {
      tenant_id: tenant,
      manifest_id: manifest.id,
      profile_id: m.profile_id,
      person_name: p?.full_name || p?.email || "Crew member",
      position: m.position,
    };
  });
  await supabase.from("offshore_manifest_pax").insert(pax);
  rev();
  return { ok: true };
}

export async function setManifestStatus(
  id: string,
  status: "draft" | "approved" | "locked" | "cancelled",
): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase.from("offshore_manifests").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function togglePaxNoShow(id: string, noShow: boolean): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase
    .from("offshore_manifest_pax")
    .update({ no_show: noShow })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function removeManifestPax(id: string): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase.from("offshore_manifest_pax").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/**
 * Confirm the movement: outbound puts each (non-no-show) staff passenger on
 * board (POB up, fixed room assigned); inbound demobilises them (POB down).
 * Seat capacity is enforced. Manifest must be locked first.
 */
export async function confirmManifestMovement(id: string): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { data: m } = await supabase
    .from("offshore_manifests")
    .select("id, direction, installation_id, crew_id, scheduled_date, seat_capacity, status")
    .eq("id", id)
    .maybeSingle();
  if (!m) return { ok: false, error: "Manifest not found." };
  if (m.status !== "locked")
    return { ok: false, error: "Lock the manifest before confirming the movement." };

  const { data: pax } = await supabase
    .from("offshore_manifest_pax")
    .select("id, profile_id, no_show")
    .eq("manifest_id", id);
  const travelling = (pax ?? []).filter((p) => !p.no_show && p.profile_id);
  if (travelling.length > (m.seat_capacity as number)) {
    return { ok: false, error: `Over seat capacity (${travelling.length}/${m.seat_capacity}).` };
  }

  if (m.direction === "out") {
    // Fixed-room lookup for each member.
    const ids = travelling.map((p) => p.profile_id as string);
    const { data: staff } = await supabase
      .from("offshore_staff")
      .select("profile_id, fixed_room_id, fixed_bed")
      .in("profile_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const roomByProfile = new Map<string, { room: string | null; bed: string | null }>();
    for (const s of staff ?? [])
      roomByProfile.set(s.profile_id as string, {
        room: (s.fixed_room_id as string) ?? null,
        bed: (s.fixed_bed as string) ?? null,
      });

    const nowIso = new Date().toISOString();
    for (const p of travelling) {
      const fixed = roomByProfile.get(p.profile_id as string);
      await supabase.from("offshore_trips").insert({
        tenant_id: tenant,
        profile_id: p.profile_id,
        installation_id: m.installation_id,
        crew_id: m.crew_id,
        category: "staff",
        trip_type: "crew_change_out",
        mobilize_date: m.scheduled_date,
        status: "onboard",
        hse_cleared_at: nowIso, // manifest approval is the HSE gate
        room_id: fixed?.room ?? null,
        bed_no: fixed?.bed ?? null,
      });
    }
  } else {
    // Inbound: demobilise the active onboard trip for each passenger.
    for (const p of travelling) {
      await supabase
        .from("offshore_trips")
        .update({ status: "demobilised", demob_date: m.scheduled_date })
        .eq("profile_id", p.profile_id)
        .eq("status", "onboard");
    }
  }

  await supabase
    .from("offshore_manifest_pax")
    .update({ boarded: true })
    .eq("manifest_id", id)
    .eq("no_show", false);
  await supabase.from("offshore_manifests").update({ status: "completed" }).eq("id", id);
  rev();
  return { ok: true };
}

// --- Installations (configurable) --------------------------------------------

export async function upsertInstallation(input: {
  id?: string;
  name: string;
  pobCapacity?: number;
}): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!input.name.trim()) return { ok: false, error: "Installation name is required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const row = {
    tenant_id: tenant,
    name: input.name.trim(),
    pob_capacity: Math.max(0, Math.floor(input.pobCapacity ?? 0)),
  };
  const { error } = input.id
    ? await supabase.from("offshore_installations").update(row).eq("id", input.id)
    : await supabase.from("offshore_installations").insert(row);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setInstallationActive(id: string, isActive: boolean): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase
    .from("offshore_installations")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// --- Bulk room import --------------------------------------------------------

export interface BulkRoomRow {
  installation: string;
  block?: string;
  floor?: string;
  roomNumber: string;
  roomType?: string;
  bedCount?: string;
  maxBedCount?: string;
  gender?: string;
  status?: string;
  specialFlag?: string;
  notes?: string;
}

export interface BulkRoomResult {
  room: string;
  ok: boolean;
  status: "created" | "updated" | "failed";
  error?: string;
}

export async function bulkUpsertRooms(
  rows: BulkRoomRow[],
): Promise<ActionResult & { results?: BulkRoomResult[] }> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!rows?.length) return { ok: false, error: "No rows to import." };
  if (rows.length > 500) return { ok: false, error: "Import is limited to 500 rows." };

  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  // Resolve installations by name (case-insensitive) within the tenant.
  const { data: insts } = await supabase.from("offshore_installations").select("id, name");
  const byName = new Map<string, string>();
  for (const i of insts ?? []) byName.set((i.name as string).trim().toLowerCase(), i.id as string);

  // Existing rooms keyed by installation+number, to decide insert vs update.
  const { data: existing } = await supabase
    .from("offshore_rooms")
    .select("id, installation_id, room_number");
  const existingKey = new Map<string, string>();
  for (const r of existing ?? [])
    existingKey.set(`${r.installation_id}|${(r.room_number as string).toLowerCase()}`, r.id as string);

  const results: BulkRoomResult[] = [];
  for (const raw of rows) {
    const roomNumber = (raw.roomNumber ?? "").trim();
    const instName = (raw.installation ?? "").trim();
    if (!roomNumber && !instName) continue;
    const label = `${instName} ${roomNumber}`.trim();
    const installationId = byName.get(instName.toLowerCase());
    if (!installationId) {
      results.push({ room: label, ok: false, status: "failed", error: `Unknown installation "${instName}".` });
      continue;
    }
    if (!roomNumber) {
      results.push({ room: label, ok: false, status: "failed", error: "Missing room number." });
      continue;
    }
    const bed = Math.max(0, Math.floor(Number(raw.bedCount) || 1));
    const row = {
      tenant_id: tenant,
      installation_id: installationId,
      block: raw.block?.trim() || null,
      floor: raw.floor?.trim() || null,
      room_number: roomNumber,
      room_type: raw.roomType?.trim() || "shared",
      bed_count: bed,
      max_bed_count: Math.max(bed, Math.floor(Number(raw.maxBedCount) || bed)),
      gender_restriction: ["any", "male", "female"].includes((raw.gender ?? "").trim())
        ? raw.gender!.trim()
        : "any",
      status: ["available", "occupied", "reserved", "blocked", "maintenance", "cleaning"].includes(
        (raw.status ?? "").trim(),
      )
        ? raw.status!.trim()
        : "available",
      special_flag: raw.specialFlag?.trim() || null,
      notes: raw.notes?.trim() || null,
    };
    const existingId = existingKey.get(`${installationId}|${roomNumber.toLowerCase()}`);
    const { error } = existingId
      ? await supabase.from("offshore_rooms").update(row).eq("id", existingId)
      : await supabase.from("offshore_rooms").insert(row);
    if (error) results.push({ room: label, ok: false, status: "failed", error: error.message });
    else results.push({ room: label, ok: true, status: existingId ? "updated" : "created" });
  }

  rev();
  const ok = results.some((r) => r.ok);
  return { ok, results, error: ok ? undefined : "No rooms were imported." };
}

// --- Bulk roster (offshore staff) import -------------------------------------

export interface BulkRosterRow {
  person: string; // email or full name (must match a profile)
  crew?: string;
  position?: string;
  company?: string;
  fixedRoom?: string; // room number
  fixedBed?: string;
  backToBack?: string; // email or full name
  medicalExpiry?: string;
  bosietExpiry?: string;
  huetExpiry?: string;
  emergencyContact?: string;
  travelEligible?: string;
}

export interface BulkRosterResult {
  person: string;
  ok: boolean;
  status: "created" | "updated" | "failed";
  error?: string;
}

export async function bulkUpsertRoster(
  rows: BulkRosterRow[],
): Promise<ActionResult & { results?: BulkRosterResult[] }> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!rows?.length) return { ok: false, error: "No rows to import." };
  if (rows.length > 500) return { ok: false, error: "Import is limited to 500 rows." };

  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const [{ data: profiles }, { data: crews }, { data: rooms }, { data: staff }] =
    await Promise.all([
      supabase.from("profiles").select("id, email, full_name"),
      supabase.from("offshore_crews").select("id, name"),
      supabase.from("offshore_rooms").select("id, room_number"),
      supabase.from("offshore_staff").select("id, profile_id"),
    ]);

  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const p of profiles ?? []) {
    if (p.email) byEmail.set((p.email as string).trim().toLowerCase(), p.id as string);
    if (p.full_name) byName.set((p.full_name as string).trim().toLowerCase(), p.id as string);
  }
  const resolvePerson = (s: string) => {
    const k = s.trim().toLowerCase();
    return byEmail.get(k) ?? byName.get(k) ?? null;
  };
  const crewByName = new Map<string, string>();
  for (const c of crews ?? []) crewByName.set((c.name as string).trim().toLowerCase(), c.id as string);
  const roomByNumber = new Map<string, string>();
  for (const r of rooms ?? [])
    roomByNumber.set((r.room_number as string).trim().toLowerCase(), r.id as string);
  const staffByProfile = new Map<string, string>();
  for (const s of staff ?? []) staffByProfile.set(s.profile_id as string, s.id as string);

  const parseDate = (v?: string) => {
    const t = (v ?? "").trim();
    return t ? t : null;
  };

  const results: BulkRosterResult[] = [];
  for (const raw of rows) {
    const person = (raw.person ?? "").trim();
    if (!person) continue;
    const profileId = resolvePerson(person);
    if (!profileId) {
      results.push({ person, ok: false, status: "failed", error: "No matching user (email/name)." });
      continue;
    }
    const eligible =
      raw.travelEligible === undefined || raw.travelEligible.trim() === ""
        ? true
        : !["no", "false", "0", "n"].includes(raw.travelEligible.trim().toLowerCase());

    const row: Record<string, unknown> = {
      tenant_id: tenant,
      profile_id: profileId,
      crew_id: raw.crew?.trim() ? crewByName.get(raw.crew.trim().toLowerCase()) ?? null : null,
      position: raw.position?.trim() || null,
      company: raw.company?.trim() || null,
      fixed_room_id: raw.fixedRoom?.trim()
        ? roomByNumber.get(raw.fixedRoom.trim().toLowerCase()) ?? null
        : null,
      fixed_bed: raw.fixedBed?.trim() || null,
      back_to_back_id: raw.backToBack?.trim() ? resolvePerson(raw.backToBack) : null,
      medical_expiry: parseDate(raw.medicalExpiry),
      bosiet_expiry: parseDate(raw.bosietExpiry),
      huet_expiry: parseDate(raw.huetExpiry),
      emergency_contact: raw.emergencyContact?.trim() || null,
      travel_eligible: eligible,
    };

    const existingId = staffByProfile.get(profileId);
    const { error } = existingId
      ? await supabase.from("offshore_staff").update(row).eq("id", existingId)
      : await supabase.from("offshore_staff").insert(row);
    if (error) results.push({ person, ok: false, status: "failed", error: error.message });
    else results.push({ person, ok: true, status: existingId ? "updated" : "created" });
  }

  rev();
  const ok = results.some((r) => r.ok);
  return { ok, results, error: ok ? undefined : "No staff were imported." };
}

// --- Catering / Daily Meal Sheet ---------------------------------------------

async function canManageCatering(): Promise<boolean> {
  const a = await getAccess();
  return a.isAdmin || a.isSafetyAdmin || a.isCanteenManager;
}

/** Read the saved meal sheet (server-action wrapper for client date switching). */
export async function fetchMealSheet(
  installationId: string,
  date: string,
): Promise<{ ok: boolean; entries?: MealEntry[]; error?: string }> {
  if (!(await canManageCatering())) return { ok: false, error: "Not authorized." };
  return { ok: true, entries: await getMealSheet(installationId, date) };
}

/**
 * Build the meal sheet for an installation + date from POB. Existing rows are
 * kept (manual edits preserved); missing people are added with defaults that
 * skip breakfast/snack on their arrival day and lunch/dinner/lodging on their
 * departure day.
 */
export async function generateMealSheet(
  installationId: string,
  date: string,
): Promise<ActionResult> {
  if (!(await canManageCatering())) return { ok: false, error: "Not authorized." };
  if (!installationId || !date) return { ok: false, error: "Installation and date are required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const [{ data: trips }, { data: visits }] = await Promise.all([
    supabase
      .from("offshore_trips")
      .select("mobilize_date, demob_date, person:profiles!offshore_trips_profile_id_fkey(full_name, email)")
      .eq("installation_id", installationId)
      .eq("status", "onboard")
      .lte("mobilize_date", date),
    supabase
      .from("offshore_visit_requests")
      .select("visitor_name, depart_date, return_date")
      .eq("installation_id", installationId)
      .eq("status", "onboard")
      .lte("depart_date", date),
  ]);

  type Row = { name: string; category: "staff" | "visitor"; arrival: boolean; departure: boolean };
  const people: Row[] = [];
  for (const t of trips ?? []) {
    if (t.demob_date && (t.demob_date as string) < date) continue;
    const p = Array.isArray(t.person) ? t.person[0] : t.person;
    people.push({
      name: (p?.full_name as string) || (p?.email as string) || "Crew",
      category: "staff",
      arrival: t.mobilize_date === date,
      departure: t.demob_date === date,
    });
  }
  for (const v of visits ?? []) {
    if (v.return_date && (v.return_date as string) < date) continue;
    people.push({
      name: v.visitor_name as string,
      category: "visitor",
      arrival: v.depart_date === date,
      departure: v.return_date === date,
    });
  }

  if (people.length === 0) return { ok: false, error: "No one is on board for that date yet." };

  const rows = people.map((p) => ({
    tenant_id: tenant,
    installation_id: installationId,
    meal_date: date,
    person_name: p.name,
    category: p.category,
    breakfast: !p.arrival,
    snack: !p.arrival,
    lunch: !p.departure,
    dinner: !p.departure,
    lodging: !p.departure,
  }));

  // Add missing people only — keep any manual edits already on the sheet.
  const { error } = await supabase
    .from("offshore_meal_entries")
    .upsert(rows, { onConflict: "installation_id,meal_date,person_name", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function updateMealEntry(input: {
  id: string;
  breakfast?: boolean;
  snack?: boolean;
  lunch?: boolean;
  dinner?: boolean;
  lodging?: boolean;
}): Promise<ActionResult> {
  if (!(await canManageCatering())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  for (const k of ["breakfast", "snack", "lunch", "dinner", "lodging"] as const) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  const { error } = await supabase.from("offshore_meal_entries").update(patch).eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function addCasualMeal(input: {
  installationId: string;
  date: string;
  personName: string;
}): Promise<ActionResult> {
  if (!(await canManageCatering())) return { ok: false, error: "Not authorized." };
  if (!input.personName.trim()) return { ok: false, error: "Name is required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("offshore_meal_entries").insert({
    tenant_id: tenant,
    installation_id: input.installationId,
    meal_date: input.date,
    person_name: input.personName.trim(),
    category: "casual",
  });
  if (error)
    return {
      ok: false,
      error: error.message.includes("duplicate") ? "That name is already on the sheet." : error.message,
    };
  rev();
  return { ok: true };
}

export async function removeMealEntry(id: string): Promise<ActionResult> {
  if (!(await canManageCatering())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase.from("offshore_meal_entries").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// --- History (POB as-of + room occupancy) ------------------------------------

export async function fetchPobAsOf(
  date: string,
): Promise<{ ok: boolean; pob?: PobAsOf; error?: string }> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!date) return { ok: false, error: "Pick a date." };
  return { ok: true, pob: await getPobAsOf(date) };
}

export async function fetchRoomHistory(
  from: string,
  to: string,
): Promise<{ ok: boolean; rows?: RoomHistoryRow[]; error?: string }> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!from || !to) return { ok: false, error: "Pick a date range." };
  return { ok: true, rows: await getRoomHistory(from, to) };
}

// --- Crew assignment (drag-and-drop + calendar-driven) -----------------------

/** Assign people to a crew (crewId null = remove from crew). Upserts the roster row. */
export async function assignToCrew(
  profileIds: string[],
  crewId: string | null,
): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!profileIds.length) return { ok: false, error: "No employees selected." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  if (crewId === null) {
    // Unassign: clear crew on existing roster rows (a room isn't required either way).
    const { error } = await supabase
      .from("offshore_staff")
      .update({ crew_id: null })
      .in("profile_id", profileIds);
    if (error) return { ok: false, error: error.message };
  } else {
    // Assign — create the roster row if missing. Room can be unknown (stays null).
    const rows = profileIds.map((pid) => ({ tenant_id: tenant, profile_id: pid, crew_id: crewId }));
    const { error } = await supabase
      .from("offshore_staff")
      .upsert(rows, { onConflict: "profile_id" });
    if (error) return { ok: false, error: error.message };
  }
  rev();
  return { ok: true };
}

export interface AutoAssignResult extends ActionResult {
  matched?: boolean; // true if an existing crew matched the schedule
  crewName?: string;
}

/**
 * Auto-assign employees by their rotation schedule: find a crew with the same
 * pattern + cycle start. If none matches and a name is given, create that crew;
 * otherwise report back so the UI can propose creating one.
 */
export async function autoAssignBySchedule(input: {
  profileIds: string[];
  offshoreDays: number;
  onshoreDays: number;
  cycleStartDate: string;
  newCrewName?: string;
}): Promise<AutoAssignResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!input.profileIds.length) return { ok: false, error: "Select at least one employee." };
  if (!input.cycleStartDate) return { ok: false, error: "Cycle start date is required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const off = Math.max(1, Math.floor(input.offshoreDays || 14));
  const on = Math.max(1, Math.floor(input.onshoreDays || 14));

  const { data: match } = await supabase
    .from("offshore_crews")
    .select("id, name")
    .eq("offshore_days", off)
    .eq("onshore_days", on)
    .eq("cycle_start_date", input.cycleStartDate)
    .limit(1)
    .maybeSingle();

  let crewId = match?.id as string | undefined;
  let crewName = match?.name as string | undefined;

  if (!crewId) {
    if (!input.newCrewName?.trim()) {
      // No crew has this calendar yet — let the UI propose creating one.
      return { ok: true, matched: false };
    }
    const { data: created, error: cErr } = await supabase
      .from("offshore_crews")
      .insert({
        tenant_id: tenant,
        name: input.newCrewName.trim(),
        rotation_pattern: `${off}/${on}`,
        offshore_days: off,
        onshore_days: on,
        cycle_start_date: input.cycleStartDate,
      })
      .select("id, name")
      .maybeSingle();
    if (cErr || !created)
      return {
        ok: false,
        error: cErr?.message?.includes("duplicate") ? "A crew with that name exists." : cErr?.message ?? "Could not create crew.",
      };
    crewId = created.id;
    crewName = created.name;
  }

  const res = await assignToCrew(input.profileIds, crewId as string);
  if (!res.ok) return res;
  rev();
  return { ok: true, matched: Boolean(match), crewName };
}

/** Merge crews that share a calendar: move members to target, delete the rest. */
export async function mergeCrews(targetId: string, sourceIds: string[]): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const sources = sourceIds.filter((id) => id && id !== targetId);
  if (!sources.length) return { ok: false, error: "Nothing to merge." };
  const supabase = createClient();
  const { error: mErr } = await supabase
    .from("offshore_staff")
    .update({ crew_id: targetId })
    .in("crew_id", sources);
  if (mErr) return { ok: false, error: mErr.message };
  const { error: dErr } = await supabase.from("offshore_crews").delete().in("id", sources);
  if (dErr) return { ok: false, error: dErr.message };
  rev();
  return { ok: true };
}

// --- Register a brand-new employee from the crew builder ----------------------

export interface RegisterEmpResult extends ActionResult {
  tempPassword?: string;
}

/**
 * Create an account for someone not yet in the system and (optionally) drop
 * them straight into a crew. Email is optional — a placeholder login is used
 * and profiles.email stays null until set later.
 */
export async function registerOffshoreEmployee(input: {
  fullName: string;
  email?: string;
  company?: string;
  crewId?: string;
}): Promise<RegisterEmpResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: "Name is required." };
  const real = (input.email ?? "").trim().toLowerCase();
  if (real && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(real))
    return { ok: false, error: "Enter a valid email or leave it blank." };

  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Server is missing the service-role key." };

  if (real) {
    const { data: dup } = await admin.from("profiles").select("id").eq("email", real).maybeSingle();
    if (dup) return { ok: false, error: "An account with that email already exists." };
  }

  const hasEmail = real.length > 0;
  const loginEmail = hasEmail ? real : `pending-${randomBytes(6).toString("hex")}@no-email.local`;
  const tempPassword = randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) + "7a";

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: loginEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (cErr || !created?.user) return { ok: false, error: cErr?.message ?? "Could not create account." };
  const userId = created.user.id;

  const { error: pErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      email: hasEmail ? real : null,
      full_name: fullName,
      tenant_id: tenant,
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (pErr) return { ok: false, error: `Account created but profile setup failed: ${pErr.message}` };

  if (input.crewId) {
    await admin.from("offshore_staff").upsert(
      {
        tenant_id: tenant,
        profile_id: userId,
        crew_id: input.crewId,
        company: input.company?.trim() || null,
      },
      { onConflict: "profile_id" },
    );
  }

  rev();
  return { ok: true, tempPassword: hasEmail ? undefined : tempPassword };
}

// --- One-click crew mobilise / demobilise (from schedule suggestions) --------

/** Board a crew for its current offshore window (idempotent). */
export async function mobiliseCrew(crewId: string): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { data: crew } = await supabase
    .from("offshore_crews")
    .select("offshore_days, onshore_days, cycle_start_date, installation_id")
    .eq("id", crewId)
    .maybeSingle();
  if (!crew) return { ok: false, error: "Crew not found." };

  const DAY = 86_400_000;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  let from = today;
  let to = today + (crew.offshore_days as number) * DAY;
  if (crew.cycle_start_date) {
    const period = (crew.offshore_days as number) + (crew.onshore_days as number);
    const start = new Date((crew.cycle_start_date as string) + "T00:00:00Z").getTime();
    const idx = ((Math.floor((today - start) / DAY) % period) + period) % period;
    if (idx < (crew.offshore_days as number)) {
      from = today - idx * DAY;
      to = from + (crew.offshore_days as number) * DAY;
    }
  }
  const fromIso = new Date(from).toISOString().slice(0, 10);
  const toIso = new Date(to).toISOString().slice(0, 10);

  const { data: members } = await supabase
    .from("offshore_staff")
    .select("profile_id, fixed_room_id, fixed_bed")
    .eq("crew_id", crewId);
  const ids = (members ?? []).map((m) => m.profile_id as string);
  if (ids.length === 0) return { ok: false, error: "This crew has no members." };

  const { data: already } = await supabase
    .from("offshore_trips")
    .select("profile_id")
    .eq("status", "onboard")
    .in("profile_id", ids);
  const aboard = new Set((already ?? []).map((a) => a.profile_id as string));

  const nowIso = new Date().toISOString();
  const rows = (members ?? [])
    .filter((m) => !aboard.has(m.profile_id as string))
    .map((m) => ({
      tenant_id: tenant,
      profile_id: m.profile_id,
      installation_id: crew.installation_id,
      crew_id: crewId,
      category: "staff",
      trip_type: "crew_change_out",
      mobilize_date: fromIso,
      demob_date: toIso,
      status: "onboard",
      hse_cleared_at: nowIso, // schedule-driven boarding is the clearance gate
      room_id: m.fixed_room_id,
      bed_no: m.fixed_bed,
    }));
  if (rows.length === 0) return { ok: true }; // already all aboard
  const { error } = await supabase.from("offshore_trips").insert(rows);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Offboard everyone currently on board for a crew. */
export async function demobiliseCrew(crewId: string): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("offshore_trips")
    .update({ status: "demobilised", demob_date: today })
    .eq("crew_id", crewId)
    .eq("status", "onboard");
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
