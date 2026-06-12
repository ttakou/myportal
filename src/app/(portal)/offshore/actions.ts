"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";
import { searchBedAvailability } from "@/lib/offshore";
import type { RoomAvailability } from "@/types/offshore";

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
