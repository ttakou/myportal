/**
 * Crew change day manifests: for every day a crew changes, two manifests per
 * installation, one MOB (shore → installation) and one DEMOB (installation →
 * shore), each listing everyone due to make that journey that day.
 *
 * "Due" follows the rotation schedule, never the drift of the moment: a crew
 * member who went out early or late still travels with their crew on the
 * crew's dates. So the MOB list is every rotational member of the crews whose
 * offshore phase starts that day, and the DEMOB list every rotational member
 * of the crews whose offshore phase ends that day, whether or not the live
 * trips agree. Around the crews:
 * - visitors travel on their booked dates, once approved (or already aboard,
 *   for the return). A day with no crew change but a visitor travelling gets
 *   a manifest of its own ("Visitor movement"), only in the directions used;
 * - someone aboard outside the rotation (no crew, or not rotational) goes
 *   ashore on their trip's demob date.
 *
 * Pure: no database or clock, so the rules are unit-tested.
 */

import { isCrewChangeDate, type Direction } from "./manifest-plan";
import type { RotationCycle } from "./rotation-math";
import { movesForDay, moveDirection, type DayMove } from "./movement-change";

const DAY_MS = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);

/** How far ahead the day manifests are prepared: two 21-day hitches. */
export const DAY_MANIFEST_HORIZON_DAYS = 42;

export interface DayCrew extends RotationCycle {
  id: string;
  name: string;
  installation_id: string | null;
  transport_mode: string | null;
}

export interface DayStaff {
  profile_id: string;
  name: string;
  position: string | null;
  crew_id: string | null;
  is_rotational?: boolean | null;
}

export interface DayOnboard {
  profile_id: string | null;
  name: string;
  crew_id: string | null;
  installation_id: string | null;
  demob_date: string | null;
}

export interface DayVisit {
  id: string;
  visitor_name: string;
  status: string;
  installation_id: string | null;
  depart_date: string;
  return_date: string | null;
}

export interface DuePax {
  profile_id: string | null;
  visit_request_id: string | null;
  name: string;
  position: string | null;
  /** Why they are on the list. */
  reason: string;
}

export interface CrewChangeDay {
  date: string;
  /** The installation the manifests serve; null when the crews name none. */
  installationId: string | null;
  /** Crews starting their offshore phase (MOB). */
  out: DayCrew[];
  /** Crews ending it (DEMOB). */
  in: DayCrew[];
}

const instKey = (id: string | null) => id ?? "";

/** The crew's installation, or the tenant default when it names none. */
export function crewInstallation(c: Pick<DayCrew, "installation_id">, defaultInstallationId: string | null): string | null {
  return c.installation_id ?? defaultInstallationId;
}

/**
 * Every crew change day from `fromIso` for `days` days, one entry per
 * installation. A crew with no rotational member does not make a day.
 */
export function crewChangeDays(input: {
  crews: DayCrew[];
  staff: DayStaff[];
  fromIso: string;
  days: number;
  defaultInstallationId?: string | null;
}): CrewChangeDay[] {
  const staffed = new Set(input.staff.filter((s) => s.crew_id && s.is_rotational !== false).map((s) => s.crew_id as string));
  const crews = input.crews.filter((c) => staffed.has(c.id));
  const out: CrewChangeDay[] = [];
  for (let i = 0; i < input.days; i++) {
    const date = addDays(input.fromIso, i);
    const groups = new Map<string, CrewChangeDay>();
    for (const c of crews) {
      const goesOut = isCrewChangeDate(c, date, "out");
      const comesIn = isCrewChangeDate(c, date, "in");
      if (!goesOut && !comesIn) continue;
      const inst = crewInstallation(c, input.defaultInstallationId ?? null);
      const g = groups.get(instKey(inst)) ?? { date, installationId: inst, out: [], in: [] };
      if (goesOut) g.out.push(c);
      if (comesIn) g.in.push(c);
      groups.set(instKey(inst), g);
    }
    out.push(...[...groups.values()].sort((a, b) => instKey(a.installationId).localeCompare(instKey(b.installationId))));
  }
  return out;
}

/** Everyone due on one crew change day, in one direction, at one installation. */
export function dueForDay(input: {
  date: string;
  direction: Direction;
  installationId: string | null;
  crews: DayCrew[];
  staff: DayStaff[];
  onboard: DayOnboard[];
  visits: DayVisit[];
  defaultInstallationId?: string | null;
  /** Approved movement changes: off on the scheduled date, on on the requested one. */
  moves?: DayMove[];
}): DuePax[] {
  const { date, direction, installationId } = input;
  const here = (inst: string | null) => inst === null || installationId === null || inst === installationId;
  const moving = input.crews.filter(
    (c) => isCrewChangeDate(c, date, direction) && crewInstallation(c, input.defaultInstallationId ?? null) === installationId,
  );
  const crewName = new Map(moving.map((c) => [c.id, c.name]));
  const verb = direction === "out" ? "due offshore" : "due ashore";

  const picks: DuePax[] = [];
  const seenProfile = new Set<string>();
  const add = (p: DuePax) => {
    if (p.profile_id) {
      if (seenProfile.has(p.profile_id)) return;
      seenProfile.add(p.profile_id);
    }
    picks.push(p);
  };

  // The rotation: every rotational member of the crews changing today.
  for (const s of input.staff) {
    if (!s.crew_id || !crewName.has(s.crew_id) || s.is_rotational === false) continue;
    add({ profile_id: s.profile_id, visit_request_id: null, name: s.name, position: s.position, reason: `${crewName.get(s.crew_id)} — ${verb}` });
  }

  if (direction === "in") {
    // Aboard outside the rotation: ashore on the trip's own demob date.
    const rotational = new Set(input.staff.filter((s) => s.crew_id && s.is_rotational !== false).map((s) => s.profile_id));
    const positionOf = new Map(input.staff.map((s) => [s.profile_id, s.position]));
    for (const o of input.onboard) {
      if (o.demob_date !== date || !here(o.installation_id)) continue;
      if (o.profile_id && rotational.has(o.profile_id)) continue;
      add({
        profile_id: o.profile_id,
        visit_request_id: null,
        name: o.name,
        position: o.profile_id ? positionOf.get(o.profile_id) ?? null : null,
        reason: "On board — demob date",
      });
    }
  }

  // Visitors on their booked dates.
  for (const p of visitorsDue(input.visits, date, direction, installationId, input.defaultInstallationId ?? null)) add(p);

  // Approved movement changes: moved off their scheduled day, onto the new one.
  const moved = movesForDay(input.moves ?? [], date, direction, installationId, input.defaultInstallationId ?? null);
  const kept = picks.filter((p) => !p.profile_id || !moved.skip.has(p.profile_id));
  picks.length = 0;
  seenProfile.clear();
  for (const p of kept) add(p);
  for (const m of moved.add) add({ ...m, visit_request_id: null });

  return picks.sort((a, b) => a.reason.localeCompare(b.reason) || a.name.localeCompare(b.name));
}

/** Where a visitor goes: their installation, else the tenant's default. */
function visitInstallation(v: Pick<DayVisit, "installation_id">, defaultInstallationId: string | null): string | null {
  return v.installation_id ?? defaultInstallationId;
}

/** True when a visitor makes the journey on `date`: out once approved, back once approved or aboard. */
function visitorTravels(v: DayVisit, date: string, direction: Direction): boolean {
  return direction === "out"
    ? v.status === "approved" && v.depart_date === date
    : v.return_date === date && (v.status === "approved" || v.status === "onboard");
}

/** Visitors on their booked dates for one manifest. */
export function visitorsDue(
  visits: DayVisit[],
  date: string,
  direction: Direction,
  installationId: string | null,
  defaultInstallationId: string | null,
): DuePax[] {
  return visits
    .filter((v) => visitorTravels(v, date, direction))
    .filter((v) => {
      const inst = visitInstallation(v, defaultInstallationId);
      return installationId === null || inst === null || inst === installationId;
    })
    .map((v) => ({
      profile_id: null,
      visit_request_id: v.id,
      name: v.visitor_name,
      position: "Visitor",
      reason: direction === "out" ? "Visitor — booked departure" : "Visitor — booked return",
    }));
}

export interface ManifestDay extends CrewChangeDay {
  /** The journeys that day needs a manifest for. */
  directions: Direction[];
  /** True when a crew changes that day; false for visitors only. */
  crewDay: boolean;
}

/**
 * Every day that needs manifests, from `fromIso` for `days` days: each crew
 * change day (both directions), and each other day a visitor departs or
 * returns (only the directions used).
 */
export function manifestDays(input: {
  crews: DayCrew[];
  staff: DayStaff[];
  visits: DayVisit[];
  fromIso: string;
  days: number;
  defaultInstallationId?: string | null;
  moves?: DayMove[];
}): ManifestDay[] {
  const def = input.defaultInstallationId ?? null;
  const crewDays = crewChangeDays(input).map((d) => ({ ...d, directions: ["out", "in"] as Direction[], crewDay: true }));
  const key = (date: string, inst: string | null) => `${date}|${instKey(inst)}`;
  const byKey = new Map<string, ManifestDay>(crewDays.map((d) => [key(d.date, d.installationId), d]));
  const last = addDays(input.fromIso, input.days - 1);
  const inWindow = (d: string | null) => d !== null && d >= input.fromIso && d <= last;

  for (const v of input.visits) {
    const inst = visitInstallation(v, def);
    const moves: [string, Direction][] = [];
    if (inWindow(v.depart_date) && visitorTravels(v, v.depart_date, "out")) moves.push([v.depart_date, "out"]);
    if (v.return_date && inWindow(v.return_date) && visitorTravels(v, v.return_date, "in")) moves.push([v.return_date, "in"]);
    for (const [date, direction] of moves) {
      const k = key(date, inst);
      const day = byKey.get(k) ?? { date, installationId: inst, out: [], in: [], directions: [], crewDay: false };
      if (!day.directions.includes(direction)) day.directions.push(direction);
      byKey.set(k, day);
    }
  }
  // A day someone moves to by an approved change needs its manifest too.
  for (const m of input.moves ?? []) {
    if (!inWindow(m.requested_date)) continue;
    const inst = m.installation_id ?? def;
    const direction = moveDirection(m.kind);
    const k = key(m.requested_date, inst);
    const day = byKey.get(k) ?? { date: m.requested_date, installationId: inst, out: [], in: [], directions: [], crewDay: false };
    if (!day.directions.includes(direction)) day.directions.push(direction);
    byKey.set(k, day);
  }
  return [...byKey.values()]
    .map((d) => ({ ...d, directions: (["out", "in"] as Direction[]).filter((x) => d.directions.includes(x)) }))
    .sort((a, b) => a.date.localeCompare(b.date) || instKey(a.installationId).localeCompare(instKey(b.installationId)));
}

/** "Visitor movement 2026-10-14 · MOB · Shore → Juliet": a day with no crew change. */
export function visitorManifestTitle(date: string, direction: Direction, installationName: string | null): string {
  const place = installationName?.trim() || "Installation";
  return direction === "out" ? `Visitor movement ${date} · MOB · Shore → ${place}` : `Visitor movement ${date} · DEMOB · ${place} → Shore`;
}

/** The transport the crews share, lower-cased as manifests store it; null when they differ or none is set. */
export function sharedTransport(crews: Pick<DayCrew, "transport_mode">[]): string | null {
  const modes = [...new Set(crews.map((c) => (c.transport_mode ?? "").trim().toLowerCase()).filter(Boolean))];
  return modes.length === 1 && (modes[0] === "boat" || modes[0] === "helicopter") ? modes[0] : null;
}

/** "Crew change 2026-10-13 · MOB · Shore → Juliet". */
export function dayManifestTitle(date: string, direction: Direction, installationName: string | null): string {
  const place = installationName?.trim() || "Installation";
  return direction === "out" ? `Crew change ${date} · MOB · Shore → ${place}` : `Crew change ${date} · DEMOB · ${place} → Shore`;
}

/** Seats for a new day manifest: everyone due, and never under a helicopter's 12. */
export function daySeats(paxCount: number): number {
  return Math.max(12, paxCount);
}
