"use server";

import { createClient } from "@/lib/supabase/server";
import { planBedAllocation } from "@/lib/offshore/allocation";
import { notifyUsers } from "@/lib/notify";
import type { ActionResult } from "@/types/actions";
import { requireOffshore, requireOffshoreDispatch, rev, tenantId } from "./_shared";

/** Assign people to a crew (crewId null = remove from crew). Upserts the roster row. */
export async function assignToCrew(
  profileIds: string[],
  crewId: string | null,
): Promise<ActionResult> {
  const gate = await requireOffshoreDispatch("manage");
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
  await notifyUsers({
    tenantId: tenant,
    profileIds: profileIds,
    category: "general",
    title: "Crew assignment updated",
    body: "Your offshore crew assignment has changed.",
    url: "/offshore",
  });
  rev();
  return { ok: true };
}

/** Re-classify an on-board person as staff or visitor (POB category). */
export async function setTripCategory(
  tripId: string,
  category: "staff" | "visitor",
): Promise<ActionResult> {
  const gate = await requireOffshoreDispatch("edit");
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
  const gate = await requireOffshoreDispatch("operate");
  if (gate) return gate;
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Read the affected person + tenant from the trip before demobilising it.
  const { data: trip } = await supabase
    .from("offshore_trips")
    .select("profile_id, tenant_id")
    .eq("id", tripId)
    .maybeSingle();

  const { error } = await supabase
    .from("offshore_trips")
    .update({ status: "demobilised", demob_date: today })
    .eq("id", tripId);
  if (error) return { ok: false, error: error.message };
  if (trip?.tenant_id && trip.profile_id) {
    await notifyUsers({
      tenantId: trip.tenant_id as string,
      profileIds: [trip.profile_id as string],
      category: "general",
      title: "Demobilised",
      body: "Your offshore trip has been demobilised.",
      url: "/offshore",
    });
  }
  rev();
  return { ok: true };
}

/** Set or clear a roster member's back-to-back partner (by profile ids). */
export async function setBackToBack(
  profileId: string,
  b2bProfileId: string | null,
): Promise<ActionResult> {
  const gate = await requireOffshoreDispatch("edit");
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
 * Directly set (or clear) one roster member's default/fixed room — independent
 * of whether they're currently on board. Picking a person as a room's default
 * owner, moving them to another room, or clearing it all flow through here.
 * Passing roomId = null clears their fixed room (and bed).
 */
export async function setStaffFixedRoom(
  profileId: string,
  roomId: string | null,
  bedNo?: string | null,
): Promise<ActionResult> {
  const gate = await requireOffshore("manage");
  if (gate) return gate;
  if (!profileId) return { ok: false, error: "No person selected." };
  const supabase = createClient();
  const patch: Record<string, unknown> = { fixed_room_id: roomId || null };
  // Clearing the room clears the bed too; otherwise only touch the bed when given.
  if (!roomId) patch.fixed_bed = null;
  else if (bedNo !== undefined) patch.fixed_bed = bedNo?.trim() || null;
  const { error } = await supabase
    .from("offshore_staff")
    .update(patch)
    .eq("profile_id", profileId);
  if (error) return { ok: false, error: error.message };
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

export interface AutoAllocateResult extends ActionResult {
  placed?: number;
  unplaced?: number;
}

/**
 * One-click bed allocation: seat every on-board person who has no bed yet.
 *
 * Each person's fixed cabin is honoured first (when it still has a free bed);
 * the rest fill rooms open to anyone, one room at a time so crewmates land
 * together, with beds auto-numbered. Gender-restricted rooms are left for manual
 * placement — staff gender isn't recorded, so this never mis-seats anyone.
 */
export async function autoAllocateBeds(): Promise<AutoAllocateResult> {
  const gate = await requireOffshore("operate");
  if (gate) return gate;
  const supabase = createClient();

  // Everyone on board (seated or not); the seated ones tell us which beds are free.
  const { data: tripRows } = await supabase
    .from("offshore_trips")
    .select("id, profile_id, crew_id, room_id, bed_no")
    .eq("status", "onboard");
  const onboard = (tripRows ?? []) as {
    id: string;
    profile_id: string | null;
    crew_id: string | null;
    room_id: string | null;
    bed_no: string | null;
  }[];
  const needBed = onboard.filter((t) => !t.room_id);
  if (needBed.length === 0) return { ok: true, placed: 0, unplaced: 0 };

  // Rooms open for allocation (skip blocked / under maintenance).
  const { data: roomRows } = await supabase
    .from("offshore_rooms")
    .select("id, bed_count, gender_restriction, status, is_active")
    .eq("is_active", true);
  const rooms = ((roomRows ?? []) as Record<string, any>[]).filter(
    (r) => !["blocked", "maintenance"].includes(r.status),
  );

  // Active visitor allocations occupy a bed each (no bed label).
  const { data: allocs } = await supabase
    .from("offshore_bed_allocations")
    .select("room_id, status")
    .neq("status", "checked_out");

  // Fixed cabins for the people who still need a bed.
  const needIds = needBed.map((t) => t.profile_id).filter(Boolean) as string[];
  const { data: staffRows } = needIds.length
    ? await supabase
        .from("offshore_staff")
        .select("profile_id, fixed_room_id, fixed_bed")
        .in("profile_id", needIds)
    : { data: [] as Record<string, any>[] };
  const fixedByProfile = new Map<string, { room_id: string | null; bed: string | null }>();
  for (const s of (staffRows ?? []) as Record<string, any>[])
    fixedByProfile.set(s.profile_id, { room_id: s.fixed_room_id ?? null, bed: s.fixed_bed ?? null });

  // Pure placement rules live in lib/offshore/allocation (unit-tested).
  const { assignments, unplaced } = planBedAllocation({
    onboard,
    rooms: rooms.map((r) => ({
      id: r.id as string,
      bed_count: (r.bed_count as number) ?? 0,
      gender_restriction: (r.gender_restriction as string) ?? "any",
      status: r.status as string,
    })),
    visitorAllocations: ((allocs ?? []) as Record<string, any>[]).map(
      (a) => (a.room_id as string | null) ?? null,
    ),
    fixedByProfile,
  });

  // Each row gets a different room/bed, so these are separate updates — run
  // them concurrently instead of one round-trip at a time.
  const results = await Promise.all(
    assignments.map((a) =>
      supabase.from("offshore_trips").update({ room_id: a.room_id, bed_no: a.bed_no }).eq("id", a.id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  rev();
  return { ok: true, placed: assignments.length, unplaced };
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
  const gate = await requireOffshoreDispatch("manage");
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
  const gate = await requireOffshoreDispatch("manage");
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
