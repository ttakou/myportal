/**
 * What a manual change to the cycle process will do, in words, before it does it.
 *
 * Opening a phase moves where the cycle is for everybody in it — a hundred and
 * twenty people — and it used to happen on one click, with nothing between
 * the click and the change. The same for closing a phase, moving a boundary
 * date, launching or closing a cycle. A misclick on the phase strip re-opened
 * goal setting for the whole company.
 *
 * Every such change now passes through a confirmation that says what will
 * happen. The wording lives here, pure, so each screen says the same thing
 * about the same change and the rule about what needs confirming is tested.
 */

export type CycleChange =
  | { kind: "open_phase"; phase: string }
  | { kind: "close_phase"; phase: string }
  | { kind: "follow_dates" }
  | { kind: "move_boundary"; label: string; from: string | null; to: string }
  | { kind: "launch_cycle"; cycle: string }
  | { kind: "close_cycle"; cycle: string };

export interface CycleChangeText {
  title: string;
  /** What will happen to whom, in a sentence or two. */
  consequence: string;
  confirmLabel: string;
}

export function describeCycleChange(
  change: CycleChange,
  ctx: { participants: number | null; cycleName?: string | null },
): CycleChangeText {
  const who =
    ctx.participants == null
      ? "everybody in the cycle"
      : `all ${ctx.participants} ${ctx.participants === 1 ? "person" : "people"} in the cycle`;
  const cycle = ctx.cycleName ? ` (${ctx.cycleName})` : "";

  switch (change.kind) {
    case "open_phase":
      return {
        title: `Open ${change.phase}?`,
        consequence: `This sets where the cycle is for ${who}${cycle}. Each person still works through their own steps in order — nobody is moved past theirs — but the module, the reminders and the status report will all say the cycle is at ${change.phase}. Your name is recorded against the change.`,
        confirmLabel: `Open ${change.phase}`,
      };
    case "close_phase":
      return {
        title: `Close ${change.phase}?`,
        consequence: `No phase will be open for ${who}${cycle} until one is opened again. Steps already taken are kept; nothing is undone. Your name is recorded against the change.`,
        confirmLabel: `Close ${change.phase}`,
      };
    case "follow_dates":
      return {
        title: "Follow the dates instead?",
        consequence: `The open phase will no longer be set by hand: the cycle${cycle} will read which phase is open from the stage dates, for ${who}. If the dates say a different phase from the one open now, that is the one people will see.`,
        confirmLabel: "Follow the dates",
      };
    case "move_boundary":
      return {
        title: `Move ${change.label}${change.from ? ` from ${change.from}` : ""} to ${change.to}?`,
        consequence: `This changes the deadline of the step that boundary turns on, for ${who}${cycle}. Steps either side shift only as far as the order requires; anything that moves is listed after saving. Reminders use the new dates from tomorrow's run.`,
        confirmLabel: "Move the date",
      };
    case "launch_cycle":
      return {
        title: `Launch ${change.cycle}?`,
        consequence: `An appraisal is created for everybody on the roster and the cycle becomes the active one. Reviewers are copied from each person's reporting line as it stands today. This cannot be undone from the console.`,
        confirmLabel: `Launch ${change.cycle}`,
      };
    case "close_cycle":
      return {
        title: `Close ${change.cycle}?`,
        consequence: `The cycle becomes read-only for ${who}: no more steps can be taken, no ratings changed, nobody added. Outcomes stay visible. Reopening is not offered on the console.`,
        confirmLabel: `Close ${change.cycle}`,
      };
  }
}

/** A short line for the audit note or the toast, once the change has happened. */
export function cycleChangeDone(change: CycleChange): string {
  switch (change.kind) {
    case "open_phase":
      return `${change.phase} is open.`;
    case "close_phase":
      return `${change.phase} is closed.`;
    case "follow_dates":
      return "The open phase now follows the dates.";
    case "move_boundary":
      return `${change.label} moved to ${change.to}.`;
    case "launch_cycle":
      return `${change.cycle} launched.`;
    case "close_cycle":
      return `${change.cycle} closed.`;
  }
}
