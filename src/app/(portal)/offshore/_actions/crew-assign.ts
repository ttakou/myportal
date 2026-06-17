"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";
import { requireOffshore, rev, tenantId } from "./_shared";

/** Assign people to a crew (crewId null = remove from crew). Upserts the roster row. */
export async function assignToCrew(
  profileIds: string[],
  crewId: string | null,
): Promise<ActionResult> {
  const gate = await requireOffshore("manage");
  if (gate) return gate;
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
  // Keep any live on-board trips in sync so POB-by-crew reflects the change now.
  const { error: tripErr } = await supabase
    .from("offshore_trips")
    .update({ crew_id: crewId })
    .in("profile_id", profileIds)
    .eq("status", "onboard");
  if (tripErr) return { ok: false, error: tripErr.message };
  rev();
  return { ok: true };
}

/** Re-classify an on-board person as staff or visitor (POB category). */
export async function setTripCategory(
  tripId: string,
  category: "staff" | "visitor",
): Promise<ActionResult> {
  const gate = await requireOffshore("edit");
  if (gate) return gate;
  const supabase = createClient();
  const patch: Record<string, unknown> = { category };
  // A visitor isn't part of a crew rotation — clear any crew on the trip.
  if (category === "visitor") patch.crew_id = null;
  const { error } = await supabase.from("offshore_trips").update(patch).eq("id", tripId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Offboard one person (demobilise their live trip) — removes them from POB. */
export async function offboardTrip(tripId: string): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("offshore_trips")
    .update({ status: "demobilised", demob_date: today })
    .eq("id", tripId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Set or clear a roster member's back-to-back partner (by profile ids). */
export async function setBackToBack(
  profileId: string,
  b2bProfileId: string | null,
): Promise<ActionResult> {
  const gate = await requireOffshore("edit");
  if (gate) return gate;
  if (profileId === b2bProfileId) return { ok: false, error: "A person can't be their own back-to-back." };
  const supabase = createClient();
  const { error } = await supabase
    .from("offshore_staff")
    .update({ back_to_back_id: b2bProfileId })
    .eq("profile_id", profileId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/**
 * Set a room's default owners from who is currently allocated there: each
 * on-board rotator's fixed room/bed is set to this room, and their back-to-back
 * (who shares the cabin on the opposite rotation) gets the same fixed room.
 */
export async function setRoomDefaultOwners(roomId: string): Promise<ActionResult> {
  const gate = await requireOffshore("manage");
  if (gate) return gate;
  const supabase = createClient();
  const { data: trips } = await supabase
    .from("offshore_trips")
    .select("profile_id, bed_no")
    .eq("status", "onboard")
    .eq("room_id", roomId)
    .not("profile_id", "is", null);
  if (!trips?.length) return { ok: false, error: "No one is currently allocated to this room." };

  for (const t of trips) {
    await supabase
      .from("offshore_staff")
      .update({ fixed_room_id: roomId, fixed_bed: (t.bed_no as string | null) ?? null })
      .eq("profile_id", t.profile_id as string);
    const { data: s } = await supabase
      .from("offshore_staff")
      .select("back_to_back_id")
      .eq("profile_id", t.profile_id as string)
      .maybeSingle();
    if (s?.back_to_back_id) {
      await supabase
        .from("offshore_staff")
        .update({ fixed_room_id: roomId })
        .eq("profile_id", s.back_to_back_id as string);
    }
  }
  rev();
  return { ok: true };
}

/** Set every room's default owners from the current allocation in one pass. */
export async function setAllRoomDefaults(): Promise<ActionResult> {
  const gate = await requireOffshore("manage");
  if (gate) return gate;
  const supabase = createClient();
  const { data: trips } = await supabase
    .from("offshore_trips")
    .select("profile_id, bed_no, room_id")
    .eq("status", "onboard")
    .not("room_id", "is", null)
    .not("profile_id", "is", null);
  if (!trips?.length) return { ok: false, error: "Nobody is currently on board." };

  const { data: staff } = await supabase.from("offshore_staff").select("profile_id, back_to_back_id");
  const b2bByProfile = new Map<string, string | null>();
  for (const s of staff ?? []) b2bByProfile.set(s.profile_id as string, (s.back_to_back_id as string | null) ?? null);

  for (const t of trips) {
    await supabase
      .from("offshore_staff")
      .update({ fixed_room_id: t.room_id as string, fixed_bed: (t.bed_no as string | null) ?? null })
      .eq("profile_id", t.profile_id as string);
    const b2b = b2bByProfile.get(t.profile_id as string);
    if (b2b) {
      await supabase
        .from("offshore_staff")
        .update({ fixed_room_id: t.room_id as string })
        .eq("profile_id", b2b);
    }
  }
  rev();
  return { ok: true };
}

/** Move an on-board person to a different room/bed (e.g. to clear an over-booked room). */
export async function reassignTripRoom(
  tripId: string,
  roomId: string | null,
  bedNo?: string | null,
): Promise<ActionResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();
  const patch: Record<string, unknown> = { room_id: roomId || null };
  if (bedNo !== undefined) patch.bed_no = bedNo?.trim() || null;
  const { error } = await supabase.from("offshore_trips").update(patch).eq("id", tripId);
  if (error) return { ok: false, error: error.message };
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
  /** When no crew matches and no name is given, create an auto-named crew. */
  autoName?: boolean;
}): Promise<AutoAssignResult> {
  const gate = await requireOffshore("manage");
  if (gate) return gate;
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
    const autoCrewName = `Crew ${off}/${on} · ${input.cycleStartDate}`;
    const name = input.newCrewName?.trim() || (input.autoName ? autoCrewName : "");
    if (!name) {
      // No crew has this calendar yet — let the UI propose creating one.
      return { ok: true, matched: false };
    }
    const { data: created, error: cErr } = await supabase
      .from("offshore_crews")
      .insert({
        tenant_id: tenant,
        name,
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
  const gate = await requireOffshore("manage");
  if (gate) return gate;
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
