/**
 * Who is *due* to travel on a given date — the pure maths behind pre-populating
 * a manifest from the rotation schedule and the visitor bookings.
 *
 * No I/O, so the rules that decide who ends up on a flight can be unit-tested.
 * All dates are ISO `YYYY-MM-DD` strings treated as UTC days.
 *
 * The guiding rule is that nobody is ever silently dropped: everyone the
 * schedule says should travel goes onto the manifest, and going over the seat
 * count is reported as a flag for operations to resolve — not fixed by
 * truncating the list.
 */

import { DAY_MS, type RotationCycle } from "./rotation-math";

const dayMs = (iso: string) => new Date(iso + "T00:00:00Z").getTime();
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** "out" = joining the installation (mobilise); "in" = leaving it (demobilise). */
export type Direction = "out" | "in";

export interface PlanCrew extends RotationCycle {
  id: string;
  name: string;
}

export interface PlanStaff {
  profile_id: string;
  name: string;
  crew_id: string | null;
  /** Non-rotators have no cycle, so the schedule never pulls them in. */
  is_rotational?: boolean;
}

export interface PlanOnboard {
  profile_id: string | null;
  name: string;
  crew_id: string | null;
}

export interface PlanVisit {
  id: string;
  visitor_name: string;
  status: string;
  depart_date: string;
  return_date: string | null;
}

export interface PlanPick {
  /** Profile id for staff, visit-request id for visitors. */
  id: string;
  name: string;
  kind: "staff" | "visitor";
  crew_id: string | null;
  /** Why the schedule put them here, shown in the UI. */
  reason: string;
}

export interface ManifestPlan {
  picks: PlanPick[];
  /** Crews the schedule moved on this date. */
  scheduledCrews: { id: string; name: string }[];
  /** Set when no crew moves on this date — the closest dates that do. */
  nearest: { crewId: string; crewName: string; dateIso: string }[];
}

/**
 * Does this crew change on `dateIso`, in the given direction?
 *
 * A cycle repeats every `offshore_days + onshore_days`. Outbound changes land
 * on the cycle boundary; inbound changes land `offshore_days` later, when the
 * offshore phase ends. Dates before the cycle starts never match — a schedule
 * does not run backwards.
 */
export function isCrewChangeDate(
  cycle: RotationCycle,
  dateIso: string,
  direction: Direction,
): boolean {
  const period = cycle.offshore_days + cycle.onshore_days;
  if (!cycle.cycle_start_date || period <= 0) return false;
  const offset = direction === "out" ? 0 : cycle.offshore_days;
  const days = Math.round((dayMs(dateIso) - dayMs(cycle.cycle_start_date)) / DAY_MS) - offset;
  if (days < 0) return false;
  return days % period === 0;
}

/** The first date on/after `fromIso` on which this crew changes, if any. */
export function nextCrewChangeDate(
  cycle: RotationCycle,
  fromIso: string,
  direction: Direction,
): string | null {
  const period = cycle.offshore_days + cycle.onshore_days;
  if (!cycle.cycle_start_date || period <= 0) return null;
  const offset = direction === "out" ? 0 : cycle.offshore_days;
  const base = dayMs(cycle.cycle_start_date) + offset * DAY_MS;
  const from = dayMs(fromIso);
  if (from <= base) return toIso(base);
  const steps = Math.ceil((from - base) / (period * DAY_MS));
  return toIso(base + steps * period * DAY_MS);
}

/**
 * Everyone the schedule says should be on the manifest for `dateIso`.
 *
 * Staff come from the rotation: outbound pulls the changing crews' members who
 * are not already on board, inbound pulls their members who are. Visitors come
 * from their booking — outbound on the departure date, inbound on the return
 * date — and only once approved or already on board, so speculative requests
 * never reach a flight.
 *
 * `crewIdFilter` narrows to one crew without changing any of the above.
 */
export function planManifest(input: {
  direction: Direction;
  dateIso: string;
  crewIdFilter?: string | null;
  crews: PlanCrew[];
  roster: PlanStaff[];
  onboard: PlanOnboard[];
  visits: PlanVisit[];
}): ManifestPlan {
  const { direction, dateIso, crews, roster, onboard, visits } = input;
  const crewFilter = input.crewIdFilter || null;
  if (!dateIso) return { picks: [], scheduledCrews: [], nearest: [] };

  const inScope = crewFilter ? crews.filter((c) => c.id === crewFilter) : crews;
  const moving = inScope.filter((c) => isCrewChangeDate(c, dateIso, direction));
  const movingIds = new Set(moving.map((c) => c.id));

  const onboardIds = new Set(onboard.map((o) => o.profile_id).filter(Boolean) as string[]);
  const picks: PlanPick[] = [];

  if (direction === "out") {
    // Joining: the changing crews' rotators who are not already offshore.
    for (const m of roster) {
      if (!m.crew_id || !movingIds.has(m.crew_id)) continue;
      if (m.is_rotational === false) continue;
      if (onboardIds.has(m.profile_id)) continue;
      picks.push({
        id: m.profile_id,
        name: m.name,
        kind: "staff",
        crew_id: m.crew_id,
        reason: `${moving.find((c) => c.id === m.crew_id)?.name ?? "Crew"} — due offshore`,
      });
    }
  } else {
    // Leaving: the changing crews' people who are on board right now.
    for (const o of onboard) {
      if (!o.profile_id || !o.crew_id || !movingIds.has(o.crew_id)) continue;
      picks.push({
        id: o.profile_id,
        name: o.name,
        kind: "staff",
        crew_id: o.crew_id,
        reason: `${moving.find((c) => c.id === o.crew_id)?.name ?? "Crew"} — due ashore`,
      });
    }
  }

  // Visitors travel on their booked dates, independent of any crew change, so
  // they are added even on a date no crew moves.
  if (!crewFilter) {
    for (const v of visits) {
      if (direction === "out") {
        if (v.status !== "approved" || v.depart_date !== dateIso) continue;
        picks.push({
          id: v.id,
          name: v.visitor_name,
          kind: "visitor",
          crew_id: null,
          reason: "Visitor — booked departure",
        });
      } else {
        if (v.return_date !== dateIso) continue;
        // "onboard" is the clean case. "approved" on the return date means the
        // arrival was never confirmed in the system — either they are offshore
        // and nobody marked them, or they did not travel. Listing them is the
        // safe error: a no-show is removed with one click, whereas leaving
        // somebody who IS offshore off the return manifest strands them.
        if (v.status !== "onboard" && v.status !== "approved") continue;
        picks.push({
          id: v.id,
          name: v.visitor_name,
          kind: "visitor",
          crew_id: null,
          reason:
            v.status === "onboard"
              ? "Visitor — booked return"
              : "Visitor — booked return (arrival never confirmed)",
        });
      }
    }
  }

  // Nothing scheduled? Offer the closest dates that are, so the planner can see
  // whether they simply picked the wrong day.
  const nearest =
    moving.length === 0
      ? inScope
          .map((c) => ({
            crewId: c.id,
            crewName: c.name,
            dateIso: nextCrewChangeDate(c, dateIso, direction),
          }))
          .filter((n): n is { crewId: string; crewName: string; dateIso: string } =>
            Boolean(n.dateIso),
          )
          .sort((a, b) => a.dateIso.localeCompare(b.dateIso))
          .slice(0, 3)
      : [];

  // Stable, de-duplicated output: one row per person, crew members first.
  const seen = new Set<string>();
  const deduped = picks.filter((p) => {
    const key = p.kind + p.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    picks: deduped,
    scheduledCrews: moving.map((c) => ({ id: c.id, name: c.name })),
    nearest,
  };
}

/**
 * Seat check. Reports the overflow rather than trimming the list — an
 * overbooked run is an operational decision (add a rotation, bump someone),
 * not something to resolve by quietly dropping the last passengers.
 */
export function seatOverflow(
  passengerCount: number,
  seatCapacity: number,
): { over: boolean; excess: number; free: number } {
  const seats = Math.max(0, seatCapacity);
  const excess = Math.max(0, passengerCount - seats);
  return { over: excess > 0, excess, free: Math.max(0, seats - passengerCount) };
}
