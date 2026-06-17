"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";
import { canManageOffshore, rev, tenantId } from "./_shared";

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
  lifeboat?: string;
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
  if (input.lifeboat !== undefined) patch.lifeboat = input.lifeboat.trim() || null;

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
  lifeboat?: string;
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
  if (input.lifeboat !== undefined) patch.lifeboat = input.lifeboat.trim() || null;
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
