import { createClient } from "@/lib/supabase/server";
import type { PobAsOf, PobBreakdown, PobPerson } from "@/types/offshore";
import { one } from "./_shared";
import { tripLifeboat, visitorLifeboat } from "./lifeboat";
import type { RotationCycle } from "./rotation-math";
import {
  identityOf,
  scheduleStateOf,
  type OffshoreIdentity,
  type ScheduleState,
} from "./pob-classify";

/** POB dashboard: counts by installation, crew, category + today's movements. */
export async function getPobBreakdown(): Promise<PobBreakdown> {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: onboard },
    { data: pob },
    { data: arrivals },
    { data: visitors },
    { data: staffRows },
    { data: crewRows },
  ] =
    await Promise.all([
      supabase
        .from("offshore_trips")
        .select(
          "id, profile_id, crew_id, room_id, bed_no, category, mobilize_date, demob_date, lifeboat, lifeboat_override," +
            " installation:offshore_installations(name), crew:offshore_crews(name)," +
            " room:offshore_rooms(room_number, block, lifeboat)," +
            " person:profiles!offshore_trips_profile_id_fkey(full_name)",
        )
        .eq("status", "onboard"),
      supabase.from("offshore_pob").select("name, pob, pob_capacity").order("name"),
      supabase
        .from("offshore_trips")
        .select("id")
        .eq("mobilize_date", today)
        .in("status", ["manifested", "hse_cleared"]),
      supabase
        .from("offshore_visit_requests")
        .select(
          "id, visitor_name, visitor_company, is_casual, lifeboat, return_date, depart_date," +
            " installation:offshore_installations(name)," +
            " offshore_bed_allocations(status, room:offshore_rooms(room_number, block, lifeboat))",
        )
        .eq("status", "onboard"),
      supabase.from("offshore_staff").select("profile_id, company, is_rotational"),
      supabase.from("offshore_crews").select("id, offshore_days, onshore_days, cycle_start_date"),
    ]);

  // Identity comes from the roster, schedule state from the crew's cycle.
  const rosterByProfile = new Map<string, { is_rotational: boolean }>();
  for (const s of (staffRows ?? []) as Record<string, any>[]) {
    rosterByProfile.set(s.profile_id as string, {
      is_rotational: (s.is_rotational as boolean | null) ?? true,
    });
  }
  const cycleByCrew = new Map<string, RotationCycle>();
  for (const c of (crewRows ?? []) as Record<string, any>[]) {
    cycleByCrew.set(c.id as string, {
      offshore_days: (c.offshore_days as number) ?? 0,
      onshore_days: (c.onshore_days as number) ?? 0,
      cycle_start_date: (c.cycle_start_date as string | null) ?? null,
    });
  }
  const byIdentity: Record<OffshoreIdentity, number> = {
    rotational: 0,
    non_rotational: 0,
    visitor: 0,
  };
  const byScheduleState: Record<ScheduleState, number> = {
    on_schedule: 0,
    due_ashore: 0,
    overstaying: 0,
    early: 0,
    unscheduled: 0,
  };

  const companyByProfile = new Map<string, string | null>();
  for (const s of (staffRows ?? []) as Record<string, any>[]) {
    companyByProfile.set(s.profile_id as string, (s.company as string | null) ?? null);
  }

  const rows = onboard ?? [];
  const byCrewMap = new Map<string, number>();
  const byLifeboatMap = new Map<string, number>();
  const byInstMap = new Map<string, number>(); // visitor counts per installation
  let staff = 0;
  let visitor = 0;
  let departuresToday = 0;
  let arrivalsToday = arrivals?.length ?? 0;
  const overstayers: PobBreakdown["overstayers"] = [];
  const people: PobBreakdown["people"] = [];

  for (const r of rows as Record<string, any>[]) {
    // Identity from the roster, never from the crew: a rotator who overstays,
    // arrives early or sits between crews is still rotational staff. The old
    // rule ("no crew ⇒ visitor") answered two questions with one field and
    // silently demoted those people to guests.
    const roster = r.profile_id ? rosterByProfile.get(r.profile_id as string) : undefined;
    const identity = identityOf({
      rostered: Boolean(roster),
      isRotational: roster?.is_rotational,
    });
    byIdentity[identity]++;
    const state = scheduleStateOf({
      todayIso: today,
      demobDate: (r.demob_date as string | null) ?? null,
      mobilizeDate: (r.mobilize_date as string | null) ?? null,
      cycle: r.crew_id ? cycleByCrew.get(r.crew_id as string) ?? null : null,
    });
    byScheduleState[state]++;
    const countsAsVisitor = identity === "visitor";
    if (countsAsVisitor) visitor++;
    else staff++;
    const crewName = one<{ name?: string }>(r.crew)?.name ?? null;
    const crew = crewName ?? "Unassigned";
    byCrewMap.set(crew, (byCrewMap.get(crew) ?? 0) + 1);
    const room = one<{ room_number?: string; block?: string; lifeboat?: string }>(r.room);
    const muster = tripLifeboat({
      lifeboat_override: r.lifeboat_override as string | null,
      room_lifeboat: (room?.lifeboat as string | null) ?? null,
      lifeboat: r.lifeboat as string | null,
    });
    const lb = muster || "Unassigned";
    byLifeboatMap.set(lb, (byLifeboatMap.get(lb) ?? 0) + 1);
    people.push({
      trip_id: r.id as string,
      profile_id: (r.profile_id as string | null) ?? null,
      name: one<{ full_name?: string }>(r.person)?.full_name ?? "—",
      category: countsAsVisitor ? "visitor" : "staff",
      identity,
      schedule_state: state,
      crew_id: (r.crew_id as string | null) ?? null,
      crew_name: crewName,
      lifeboat: muster,
      room_id: (r.room_id as string | null) ?? null,
      room_label: room ? [room.block, room.room_number].filter(Boolean).join(" ") : null,
      bed_no: (r.bed_no as string | null) ?? null,
      company: r.profile_id ? companyByProfile.get(r.profile_id as string) ?? null : null,
      mobilize_date: r.mobilize_date as string,
      demob_date: (r.demob_date as string | null) ?? null,
    });
    if (r.demob_date === today) departuresToday++;
    // Overstay comes from the schedule state, not from demob_date alone: that
    // is what catches somebody whose crew's phase closed weeks ago but who was
    // never given a planned return date at all.
    if (state === "overstaying") {
      overstayers.push({
        name: one<{ full_name?: string }>(r.person)?.full_name ?? "—",
        installation: one<{ name?: string }>(r.installation)?.name ?? null,
        demob_date: (r.demob_date as string | null) ?? null,
      });
    }
  }

  // Onboard visitors count toward POB too (they aren't offshore_trips rows).
  // Include casual/day visitors, and surface them per-lifeboat + in the
  // drill-down so they show on the live board and get mustered.
  for (const v of (visitors ?? []) as Record<string, any>[]) {
    visitor++;
    const instName = one<{ name?: string }>(v.installation)?.name ?? null;
    if (instName) byInstMap.set(instName, (byInstMap.get(instName) ?? 0) + 1);
    // Lifeboat: a manual/direct value wins, else the allocated cabin's station.
    const alloc = ((v.offshore_bed_allocations as any[]) ?? []).find((a) => a.status !== "checked_out");
    const vroom = alloc && one<{ room_number?: string; block?: string; lifeboat?: string }>(alloc.room);
    const vmuster = visitorLifeboat({
      lifeboat: v.lifeboat as string | null,
      room_lifeboat: (vroom?.lifeboat as string | null) ?? null,
    });
    const lb = vmuster || "Unassigned";
    byLifeboatMap.set(lb, (byLifeboatMap.get(lb) ?? 0) + 1);
    // Visitors belong to no crew, but they are on board — without this the crew
    // chips sum to less than Current POB and the two never reconcile.
    byCrewMap.set("Unassigned", (byCrewMap.get("Unassigned") ?? 0) + 1);
    byIdentity.visitor++;
    const vState = scheduleStateOf({
      todayIso: today,
      demobDate: (v.return_date as string | null) ?? null,
      mobilizeDate: (v.depart_date as string | null) ?? null,
      cycle: null,
    });
    byScheduleState[vState]++;
    people.push({
      identity: "visitor" as const,
      schedule_state: vState,
      trip_id: `visit-${v.id}`,
      profile_id: null,
      name: v.is_casual ? `${v.visitor_name} (casual)` : v.visitor_name,
      category: "visitor",
      crew_id: null,
      crew_name: null,
      lifeboat: vmuster,
      room_id: null,
      room_label: vroom ? [vroom.block, vroom.room_number].filter(Boolean).join(" ") : null,
      bed_no: null,
      company: (v.visitor_company as string | null) ?? null,
      mobilize_date: (v.depart_date as string) ?? today,
      demob_date: (v.return_date as string | null) ?? null,
    });
    if (v.return_date === today) departuresToday++;
    if (vState === "overstaying") {
      overstayers.push({
        name: v.visitor_name,
        installation: instName,
        demob_date: (v.return_date as string | null) ?? null,
      });
    }
  }

  const total = rows.length + (visitors?.length ?? 0);

  // Per-installation POB comes from the offshore_pob view (onboard trips that
  // have an installation_id) plus onboard visitors. Onboard people whose trip
  // has no installation set are otherwise invisible here, which makes the bars
  // under-count vs. the total — so surface them as an "Unassigned" bucket. This
  // keeps the per-installation breakdown reconciled with Current POB.
  const byInstallation = (pob ?? []).map((p) => ({
    name: p.name as string,
    pob: ((p.pob as number) ?? 0) + (byInstMap.get(p.name as string) ?? 0),
    capacity: (p.pob_capacity as number) ?? 0,
  }));
  const assignedToInstallation = byInstallation.reduce((sum, i) => sum + i.pob, 0);
  const unassignedPob = total - assignedToInstallation;
  if (unassignedPob > 0) {
    byInstallation.push({ name: "Unassigned (no installation)", pob: unassignedPob, capacity: 0 });
  }

  return {
    total,
    byInstallation,
    byCrew: [...byCrewMap.entries()].map(([name, n]) => ({ name, pob: n })),
    byLifeboat: [...byLifeboatMap.entries()]
      .map(([name, n]) => ({ name, pob: n }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    byCategory: { staff, visitor },
    byIdentity,
    byScheduleState,
    arrivalsToday,
    departuresToday,
    overstayers,
    people: people.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Reconstruct who was on board on a past (or current) date, from trips + visits. */
export async function getPobAsOf(date: string): Promise<PobAsOf> {
  const supabase = createClient();
  const [{ data: trips }, { data: visits }] = await Promise.all([
    supabase
      .from("offshore_trips")
      .select(
        "mobilize_date, demob_date, status, lifeboat," +
          " person:profiles!offshore_trips_profile_id_fkey(full_name, email)," +
          " installation:offshore_installations(name), crew:offshore_crews(name)",
      )
      .in("status", ["onboard", "demobilised"])
      .lte("mobilize_date", date),
    supabase
      .from("offshore_visit_requests")
      .select("visitor_name, depart_date, return_date, status, installation:offshore_installations(name)")
      .in("status", ["onboard", "returned"])
      .lte("depart_date", date),
  ]);

  const people: PobPerson[] = [];
  for (const t of (trips ?? []) as Record<string, any>[]) {
    if (t.demob_date && (t.demob_date as string) < date) continue; // left before this date
    const p = one<{ full_name?: string; email?: string }>(t.person);
    people.push({
      name: p?.full_name || p?.email || "Crew",
      category: "staff",
      installation: one<{ name?: string }>(t.installation)?.name ?? null,
      crew: one<{ name?: string }>(t.crew)?.name ?? null,
      lifeboat: (t.lifeboat as string | null) ?? null,
      from: t.mobilize_date as string,
      to: (t.demob_date as string) ?? null,
    });
  }
  for (const v of (visits ?? []) as Record<string, any>[]) {
    if (v.return_date && (v.return_date as string) < date) continue;
    people.push({
      name: v.visitor_name as string,
      category: "visitor",
      installation: one<{ name?: string }>(v.installation)?.name ?? null,
      crew: null,
      lifeboat: null,
      from: v.depart_date as string,
      to: (v.return_date as string) ?? null,
    });
  }
  people.sort((a, b) => a.name.localeCompare(b.name));
  return {
    date,
    total: people.length,
    staff: people.filter((p) => p.category === "staff").length,
    visitor: people.filter((p) => p.category === "visitor").length,
    people,
  };
}
