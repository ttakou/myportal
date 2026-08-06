/**
 * Two independent questions about somebody on board.
 *
 * These were previously answered by one field. `crew_id` decided both "what is
 * this person" and "are they where the schedule expects them", so a rotator who
 * overstayed, arrived early, or sat between crews was reclassified as a guest —
 * and a contractor deliberately outside the rotation looked the same as a
 * visitor. Splitting them lets an overstaying rotator read "Rotational staff ·
 * Overstaying" instead of silently becoming a visitor.
 */

import { DAY_MS, type RotationCycle } from "./rotation-math";

const dayMs = (iso: string) => new Date(iso + "T00:00:00Z").getTime();

// --- Axis 1: identity — what someone IS ------------------------------------

export type OffshoreIdentity = "rotational" | "non_rotational" | "visitor";

export const IDENTITY_LABEL: Record<OffshoreIdentity, string> = {
  rotational: "Rotational staff",
  non_rotational: "Non-rotational staff",
  visitor: "Visitors",
};

/**
 * Resolved from the offshore-staff roster, never from the crew.
 *
 * Visitor is the DEFAULT, not something to qualify for: a casual visitor, an
 * approved visit request, a trip merely marked as a visitor and somebody aboard
 * with no record at all must all land there. Requiring a visit request would
 * miss the casual arrivals, who never raise one.
 */
export function identityOf(person: {
  rostered: boolean;
  isRotational?: boolean | null;
}): OffshoreIdentity {
  if (!person.rostered) return "visitor";
  return person.isRotational === false ? "non_rotational" : "rotational";
}

// --- Axis 2: schedule state — where they are VERSUS the plan ----------------

export type ScheduleState =
  | "on_schedule"
  | "due_ashore"
  | "overstaying"
  | "early"
  | "unscheduled";

export const SCHEDULE_STATE_LABEL: Record<ScheduleState, string> = {
  on_schedule: "On schedule",
  due_ashore: "Due ashore today",
  overstaying: "Overstaying",
  early: "Early",
  unscheduled: "Unscheduled",
};

/** States worth surfacing as exceptions; "on schedule" is the quiet default. */
export const EXCEPTION_STATES: ScheduleState[] = [
  "overstaying",
  "due_ashore",
  "early",
  "unscheduled",
];

/**
 * Where this person sits against their crew's cycle today.
 *
 * A planned return date wins outright — it is an explicit statement about this
 * person, whereas the cycle is a statement about their crew. That also closes
 * the gap where somebody with NO return date could never be flagged however
 * long they stayed: the cycle catches them instead.
 *
 * On the boundary day the offshore phase ends, so the crew is "due ashore
 * today" rather than overstaying — they are not late until the flight has gone.
 */
export function scheduleStateOf(input: {
  todayIso: string;
  demobDate?: string | null;
  mobilizeDate?: string | null;
  cycle?: RotationCycle | null;
}): ScheduleState {
  const { todayIso, demobDate, mobilizeDate, cycle } = input;

  if (demobDate) {
    if (demobDate < todayIso) return "overstaying";
    if (demobDate === todayIso) return "due_ashore";
  }

  const period = cycle ? cycle.offshore_days + cycle.onshore_days : 0;
  if (!cycle?.cycle_start_date || period <= 0) return "unscheduled";

  const start = dayMs(cycle.cycle_start_date);
  const today = dayMs(todayIso);
  if (today < start) return "unscheduled"; // the cycle has not begun

  // Start of the cycle currently running, and when its offshore phase ends.
  const cyclesElapsed = Math.floor((today - start) / (period * DAY_MS));
  const windowStart = start + cyclesElapsed * period * DAY_MS;
  const windowEnd = windowStart + cycle.offshore_days * DAY_MS;

  if (today < windowEnd) return "on_schedule";
  if (today === windowEnd) return "due_ashore";

  // Past the offshore phase and still aboard. Whether that is late or keen
  // depends on when they boarded: before the phase closed they simply stayed;
  // after it closed they came out ahead of the next one.
  if (mobilizeDate && dayMs(mobilizeDate) > windowEnd) return "early";
  return "overstaying";
}
