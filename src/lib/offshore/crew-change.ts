/**
 * Where a rotational worker is in their crew change, from the crew's schedule.
 *
 * The dashboard card showed the last trip's dates and its status word —
 * "2026-07-18 → 2026-08-25 · Demobilised" — and nothing about the schedule
 * the person is on. Whether they are offshore now, when the current hitch
 * started or ends, and when the next crew change is, all had to be worked
 * out by hand from the crew's cycle.
 *
 * The schedule is the only source for the dates. Somebody who went out late
 * or came off early is still on their crew's rotation: the next crew change is
 * where the cycle puts it, not the trip plus twenty-eight days. What the trips
 * record is read *against* the schedule, so the card can say the two disagree,
 * but it never moves the schedule.
 *
 * Pure: dates in, words out. The cycle maths is `rotation-math`'s.
 */

import { cycleDayIndex, DAY_MS, type RotationCycle } from "./rotation-math";

const dayMs = (iso: string) => new Date(iso + "T00:00:00Z").getTime();
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type CrewPhase = "offshore" | "onshore";

export interface CrewChange {
  /** Which half of the rotation the schedule puts the crew in today. */
  phase: CrewPhase;
  /** The current hitch (offshore period): the one running, or the next one. */
  hitchFrom: string;
  hitchTo: string;
  /** When the phase flips: the demob date if offshore, the mobilise date if onshore. */
  nextChange: string;
  /** Whole days until that flip (0 on the day). */
  daysToChange: number;
  /** When the current onshore break began; null while offshore. */
  onshoreSince: string | null;
}

/** The schedule's reading of today, or null when the crew has no usable cycle. */
export function currentCrewChange(cycle: RotationCycle, todayIso: string): CrewChange | null {
  const idx = cycleDayIndex(cycle, todayIso);
  if (idx === null) return null;
  const today = dayMs(todayIso);
  const on = cycle.offshore_days * DAY_MS;
  const off = cycle.onshore_days * DAY_MS;

  if (idx < cycle.offshore_days) {
    const from = today - idx * DAY_MS;
    const to = from + on;
    return {
      phase: "offshore",
      hitchFrom: toIso(from),
      hitchTo: toIso(to),
      nextChange: toIso(to),
      daysToChange: Math.round((to - today) / DAY_MS),
      onshoreSince: null,
    };
  }
  const onshoreSince = today - (idx - cycle.offshore_days) * DAY_MS;
  const nextMob = onshoreSince + off;
  return {
    phase: "onshore",
    hitchFrom: toIso(nextMob),
    hitchTo: toIso(nextMob + on),
    nextChange: toIso(nextMob),
    daysToChange: Math.round((nextMob - today) / DAY_MS),
    onshoreSince: toIso(onshoreSince),
  };
}

export interface LatestTrip {
  mobilize: string;
  demob: string | null;
  /** As stored: requested, hse_cleared, manifested, onboard, demobilised, cancelled. */
  status: string;
}

export type CrewStatusKind =
  /** Schedule says offshore and the record agrees. */
  | "offshore"
  /** Schedule says onshore and the record agrees. */
  | "onshore"
  /** Schedule says offshore; nothing recorded says they went. */
  | "due_offshore"
  /** Schedule says onshore; the record still has them on board. */
  | "overdue_off"
  /** Schedule says offshore; the record says they came off already. */
  | "off_early";

export interface CrewStatus {
  kind: CrewStatusKind;
  /** The schedule's line: phase and the next crew change. Always present. */
  line: string;
  /** What the record says, when it disagrees with the schedule. */
  note: string | null;
}

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** Whether a recorded trip has the person on board today. */
export function tripOnBoard(trip: LatestTrip | null, todayIso: string): boolean {
  if (!trip) return false;
  if (trip.status === "cancelled" || trip.status === "demobilised") return false;
  if (trip.status === "onboard") return true;
  return trip.mobilize <= todayIso && (trip.demob === null || trip.demob >= todayIso);
}

/**
 * The schedule's reading, with the record's disagreement noted beside it.
 *
 * The line is always the schedule's — the phase the crew is in and when it
 * changes. Late and early comings and goings do not move it; they are said in
 * the note, so the person and the dispatcher can see the gap.
 */
export function crewStatus(
  change: CrewChange,
  trip: LatestTrip | null,
  todayIso: string,
): CrewStatus {
  const onBoard = tripOnBoard(trip, todayIso);

  if (change.phase === "offshore") {
    const line = `Offshore · hitch ${change.hitchFrom} → ${change.hitchTo} · crew change in ${days(change.daysToChange)}`;
    if (onBoard) return { kind: "offshore", line, note: null };
    if (trip?.status === "demobilised" && trip.demob && trip.demob >= change.hitchFrom) {
      return {
        kind: "off_early",
        line,
        note: `Came off on ${trip.demob}, before the hitch ends. The next crew change stays on the schedule.`,
      };
    }
    return {
      kind: "due_offshore",
      line,
      note: `No mobilisation recorded for this hitch.`,
    };
  }

  const line = `Onshore since ${change.onshoreSince} · next crew change ${change.nextChange} (in ${days(change.daysToChange)})`;
  if (onBoard) {
    return {
      kind: "overdue_off",
      line,
      note: `Still on board from the trip that began ${trip!.mobilize}. The next crew change stays on the schedule.`,
    };
  }
  return { kind: "onshore", line, note: null };
}
