/**
 * Movement change requests: moving one date of one hitch — mobilising early
 * or late, demobilising early or late.
 *
 * The rotation never moves. An approved change takes the person off the crew
 * change manifest of their scheduled date and puts them on the manifest of the
 * requested date; the next crew change is still the schedule's.
 *
 * Pure: dates in, decisions out.
 */

import type { RotationCycle } from "./rotation-math";
import { nextCrewChangeDate } from "./manifest-plan";

export type MoveKind = "early_mob" | "late_mob" | "early_demob" | "late_demob";
export type MoveReason = "medical" | "compassionate" | "operational" | "training_logistics" | "other";
export type MoveStatus = "pending_endorsement" | "pending" | "approved" | "rejected" | "withdrawn";
export type MoveDirection = "out" | "in";

export const MOVE_KINDS: MoveKind[] = ["early_mob", "late_mob", "early_demob", "late_demob"];
export const MOVE_REASONS: MoveReason[] = ["medical", "compassionate", "operational", "training_logistics", "other"];

export const MOVE_KIND_LABEL: Record<MoveKind, string> = {
  early_mob: "Early mobilisation",
  late_mob: "Late mobilisation",
  early_demob: "Early demobilisation",
  late_demob: "Late demobilisation (extension)",
};

export const MOVE_REASON_LABEL: Record<MoveReason, string> = {
  medical: "Medical",
  compassionate: "Compassionate / family",
  operational: "Operational need / handover",
  training_logistics: "Training / logistics",
  other: "Other",
};

export const MOVE_STATUS_LABEL: Record<MoveStatus, string> = {
  pending_endorsement: "Waiting for line manager",
  pending: "Waiting for OIM",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/** Mobilisations go out to the installation, demobilisations come in. */
export const moveDirection = (kind: MoveKind): MoveDirection => (kind.endsWith("_mob") ? "out" : "in");

/** The attendance flag an approved change leaves on the record. */
export const moveFlagKind = (kind: MoveKind) =>
  ({ early_mob: "early_arrival", late_mob: "late_arrival", early_demob: "early_departure", late_demob: "late_departure" })[kind];

const dayMs = (iso: string) => new Date(iso + "T00:00:00Z").getTime();

/** Whole days between the scheduled and requested dates. */
export const shiftDays = (scheduled: string, requested: string) =>
  Math.abs(Math.round((dayMs(requested) - dayMs(scheduled)) / 86_400_000));

/** "3 days early", "1 day late". */
export function shiftLabel(kind: MoveKind, scheduled: string, requested: string): string {
  const n = shiftDays(scheduled, requested);
  return `${n} day${n === 1 ? "" : "s"} ${kind.startsWith("early") ? "early" : "late"}`;
}

export interface PersonMovements {
  /** On board now. */
  aboard: boolean;
  /** The next mobilisation the schedule (or none) has for them. */
  mob: string | null;
  /** The demobilisation that goes with it, or the one of the hitch they are on. */
  demob: string | null;
}

/**
 * The dates a request can move. Someone on board can move their coming
 * demobilisation; someone ashore their next mobilisation and the
 * demobilisation that ends that hitch. A rotational member's dates come from
 * the crew's cycle; anyone else's from their trip.
 */
export function scheduledMovements(input: {
  todayIso: string;
  cycle: RotationCycle | null;
  /** The person's on-board trip, if any. */
  trip: { mobilize_date: string; demob_date: string | null } | null;
}): PersonMovements {
  const { todayIso, cycle, trip } = input;
  const usable = cycle && cycle.cycle_start_date && cycle.offshore_days + cycle.onshore_days > 0 ? cycle : null;
  if (trip) {
    const demob = usable ? nextCrewChangeDate(usable, todayIso, "in") : trip.demob_date;
    return { aboard: true, mob: null, demob: demob ?? trip.demob_date };
  }
  if (!usable) return { aboard: false, mob: null, demob: null };
  const mob = nextCrewChangeDate(usable, todayIso, "out");
  return { aboard: false, mob, demob: mob ? nextCrewChangeDate(usable, mob, "in") : null };
}

/** The scheduled date a change of this kind moves, if there is one. */
export function scheduledFor(kind: MoveKind, m: PersonMovements): string | null {
  return moveDirection(kind) === "out" ? m.mob : m.demob;
}

/** Can this change be asked for? An error to show, or null. */
export function checkMove(input: {
  kind: MoveKind;
  movements: PersonMovements;
  requested: string;
  todayIso: string;
}): string | null {
  const { kind, movements: m, requested, todayIso } = input;
  if (!requested) return "Pick the date you are asking for.";
  const scheduled = scheduledFor(kind, m);
  if (!scheduled) {
    return moveDirection(kind) === "out"
      ? m.aboard
        ? "Already on board: only the demobilisation can be moved."
        : "No mobilisation is scheduled to move."
      : "No demobilisation is scheduled to move.";
  }
  if (requested < todayIso) return "The requested date has passed.";
  if (requested === scheduled) return "That is the scheduled date already.";
  if (kind.startsWith("early") && requested > scheduled) return `An early change must be before ${scheduled}.`;
  if (kind.startsWith("late") && requested < scheduled) return `A late change must be after ${scheduled}.`;
  if (kind === "late_mob" && m.demob && requested >= m.demob) return `A late mobilisation must still be before the hitch ends on ${m.demob}.`;
  if (kind === "early_demob" && m.mob && requested <= m.mob) return `An early demobilisation must be after the mobilisation on ${m.mob}.`;
  return null;
}

/**
 * Where a new request goes first. A staff member asking for themselves goes
 * through their line manager, when they have one; a manager or the desk
 * asking on someone's behalf goes straight to the OIM.
 */
export function firstStatus(input: { selfRaised: boolean; hasManager: boolean }): MoveStatus {
  return input.selfRaised && input.hasManager ? "pending_endorsement" : "pending";
}

/** Still open: nothing decided yet. */
export const isOpen = (s: MoveStatus) => s === "pending_endorsement" || s === "pending";

// --- Manifests ----------------------------------------------------------------

export interface DayMove {
  profile_id: string;
  name: string;
  position: string | null;
  kind: MoveKind;
  scheduled_date: string;
  requested_date: string;
  installation_id: string | null;
}

/**
 * How approved changes alter one day's manifest: who to leave off (their
 * scheduled date, moved away) and who to add (their requested date).
 */
export function movesForDay(
  moves: DayMove[],
  date: string,
  direction: MoveDirection,
  installationId: string | null,
  defaultInstallationId: string | null,
): { skip: Set<string>; add: { profile_id: string; name: string; position: string | null; reason: string }[] } {
  const skip = new Set<string>();
  const add: { profile_id: string; name: string; position: string | null; reason: string }[] = [];
  for (const m of moves) {
    if (moveDirection(m.kind) !== direction) continue;
    if (m.scheduled_date === date) skip.add(m.profile_id);
    const inst = m.installation_id ?? defaultInstallationId;
    const here = inst === null || installationId === null || inst === installationId;
    if (m.requested_date === date && here) {
      add.push({ profile_id: m.profile_id, name: m.name, position: m.position, reason: `${MOVE_KIND_LABEL[m.kind]} — approved` });
    }
  }
  return { skip, add };
}

// --- Who a request can be raised for --------------------------------------------

export interface LineMember {
  profile_id: string;
  full_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  /** 1 = reports to the viewer directly. */
  depth: number;
}

export interface PeopleGroup {
  label: string;
  people: { id: string; name: string }[];
}

/**
 * The people a leader can raise a request for, grouped the way their
 * organisation reads: their direct team, then each sub-team under the manager
 * it reports to, then — for the offshore desk only — every other offshore
 * staff member. Only offshore staff are listed; the viewer is not.
 */
export function groupPeople(input: {
  me: string;
  line: LineMember[];
  offshore: { id: string; name: string }[];
  desk: boolean;
}): PeopleGroup[] {
  const offshoreName = new Map(input.offshore.map((p) => [p.id, p.name]));
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const inLine = new Set<string>();
  const teams = new Map<string, { label: string; depth: number; people: { id: string; name: string }[] }>();

  for (const m of input.line) {
    if (m.profile_id === input.me || !offshoreName.has(m.profile_id)) continue;
    inLine.add(m.profile_id);
    const key = m.depth <= 1 ? "" : m.manager_id ?? "";
    const label = m.depth <= 1 ? "My team" : `${m.manager_name ?? "Sub-team"}'s team`;
    const team = teams.get(key) ?? { label, depth: m.depth <= 1 ? 1 : m.depth, people: [] };
    team.people.push({ id: m.profile_id, name: offshoreName.get(m.profile_id) ?? m.full_name ?? "—" });
    teams.set(key, team);
  }

  const groups: PeopleGroup[] = [...teams.values()]
    .sort((a, b) => a.depth - b.depth || (a.label === "My team" ? -1 : b.label === "My team" ? 1 : a.label.localeCompare(b.label)))
    .map((t) => ({ label: t.label, people: t.people.sort(byName) }));

  if (input.desk) {
    const others = input.offshore.filter((p) => p.id !== input.me && !inLine.has(p.id)).sort(byName);
    if (others.length) groups.push({ label: groups.length ? "All other offshore staff" : "Offshore staff", people: others });
  }
  return groups;
}
