"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";

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
}): Promise<ActionResult> {
  if (!(await canManageOffshore())) return { ok: false, error: "Not authorized." };
  if (!input.name.trim()) return { ok: false, error: "Crew name is required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const row = {
    tenant_id: tenant,
    name: input.name.trim(),
    installation_id: input.installationId || null,
    rotation_pattern: input.rotationPattern?.trim() || null,
    offshore_days: Math.max(1, Math.floor(input.offshoreDays || 14)),
    onshore_days: Math.max(1, Math.floor(input.onshoreDays || 14)),
    transport_mode: input.transportMode?.trim() || null,
    departure_location: input.departureLocation?.trim() || null,
  };
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
