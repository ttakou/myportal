"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";
import { requireOffshore, rev, tenantId } from "./_shared";

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
  const gate = await requireOffshore("manage");
  if (gate) return gate;
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
  const gate = await requireOffshore("manage");
  if (gate) return gate;
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
