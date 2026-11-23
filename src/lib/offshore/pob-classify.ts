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
 * Coming out this close to the crew's next offshore phase is "early"; any
 * further out, aboard while the crew is ashore is overstaying.
 */
export const EARLY_WINDOW_DAYS = 7;

/**
 * Where this person sits against their crew's cycle today.
 *
 * The crew's rotation decides, not the trip's dates: a late or early mover
 * falls back to their rotation schedule. On board while the crew is due
 * ashore is overstaying — unless they came out within a week of the crew's
 * next offshore phase, which is early. On the boundary day the offshore
 * phase ends, so the crew is "due ashore today" rather than overstaying.
 *
 * Somebody with no crew cycle (a visitor, a non-rotator) is judged by their
 * planned return date instead: past it they are overstaying.
 */
export function scheduleStateOf(input: {
  todayIso: string;
  demobDate?: string | null;
  mobilizeDate?: string | null;
  cycle?: RotationCycle | null;
}): ScheduleState {
  const { todayIso, demobDate, mobilizeDate, cycle } = input;
  const period = cycle ? cycle.offshore_days + cycle.onshore_days : 0;
  const start = cycle?.cycle_start_date ? dayMs(cycle.cycle_start_date) : NaN;
  const today = dayMs(todayIso);

  if (!cycle?.cycle_start_date || period <= 0 || today < start) {
    // No rotation to measure against: the planned return date is all there is.
    if (demobDate && demobDate < todayIso) return "overstaying";
    if (demobDate && demobDate === todayIso) return "due_ashore";
    return "unscheduled";
  }

  // Start of the cycle currently running, and when its offshore phase ends.
  const cyclesElapsed = Math.floor((today - start) / (period * DAY_MS));
  const windowStart = start + cyclesElapsed * period * DAY_MS;
  const windowEnd = windowStart + cycle.offshore_days * DAY_MS;

  if (today < windowEnd) return "on_schedule";
  if (today === windowEnd) return "due_ashore";

  // The crew is ashore. Out a few days ahead of the next phase is early;
  // otherwise they should have gone home with their crew.
  const nextStart = windowStart + period * DAY_MS;
  const daysToNext = Math.round((nextStart - today) / DAY_MS);
  if (mobilizeDate && dayMs(mobilizeDate) > windowEnd && daysToNext <= EARLY_WINDOW_DAYS) return "early";
  return "overstaying";
}
