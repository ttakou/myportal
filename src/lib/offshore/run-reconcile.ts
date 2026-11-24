/**
 * Making a run's manifest reflect what really happened.
 *
 * The nightly job moves crews at 05:00 by the schedule; the boat or
 * helicopter goes later that morning. The Dispatcher then records the
 * exceptions: a no-show on a run that has already moved people puts POB
 * right (an arrival who never came is taken off; a leaver who stayed is put
 * back on board), and "Confirm run" settles everyone else.
 *
 * Pure: states in, decisions out. Dates are site dates "YYYY-MM-DD".
 */

import { movesPeopleNow } from "./undo-mobilise";

export type Direction = "out" | "in";

/** What marking (or clearing) a no-show does to POB. */
export type NoShowEffect =
  | "flag-only" // nothing has moved yet (or nothing to move): just the mark
  | "take-off" // MOB no-show: the arrival never came — their trip is cancelled
  | "put-back-on" // MOB no-show cleared: they did come — the trip is restored
  | "keep-aboard" // DEMOB no-show: they stayed — their trip is reopened
  | "send-home"; // DEMOB no-show cleared: they did leave — demobilised again

export function noShowEffect(input: {
  direction: Direction;
  scheduledDate: string;
  today: string;
  noShow: boolean;
  /**
   * Whether the record to change exists: for a MOB no-show, a trip that
   * started on the run's day (cleared: one cancelled for it); for a DEMOB
   * no-show, a trip that ended on the run's day (cleared: one still aboard).
   */
  hasRecord: boolean;
}): NoShowEffect {
  if (!movesPeopleNow(input.scheduledDate, input.today) || !input.hasRecord) return "flag-only";
  if (input.direction === "out") return input.noShow ? "take-off" : "put-back-on";
  return input.noShow ? "keep-aboard" : "send-home";
}

/** What "Confirm run" does with one passenger. */
export type ConfirmStep =
  | "skip" // marked no-show: stays as recorded
  | "board" // MOB, not aboard yet: boarded today
  | "already-aboard" // MOB, the night run (or someone) already boarded them
  | "send-home" // DEMOB, still aboard: demobilised today
  | "already-left" // DEMOB, the night run already sent them home
  | "not-aboard"; // DEMOB, was never on board: nothing to do, not ticked

export function confirmStep(input: { direction: Direction; noShow: boolean; aboard: boolean; leftOnDay: boolean }): ConfirmStep {
  if (input.noShow) return "skip";
  if (input.direction === "out") return input.aboard ? "already-aboard" : "board";
  if (input.aboard) return "send-home";
  return input.leftOnDay ? "already-left" : "not-aboard";
}

/** Steps that end with the passenger ticked as having travelled. */
export const TRAVELLED: ReadonlySet<ConfirmStep> = new Set<ConfirmStep>(["board", "already-aboard", "send-home", "already-left"]);
