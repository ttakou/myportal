/**
 * The phases of a cycle, and which one is running now.
 *
 * The five phases used to be five separate cycles, so the cycle switcher listed
 * them side by side as if a year held several appraisals. They are phases of one
 * cycle, so the switcher shows the cycle and its phases beneath — which needs
 * the stage list turned back into phases, and today's date turned into "this is
 * where we are".
 *
 * Phases are read from the stage labels rather than from a fixed list of keys,
 * so a workflow somebody edits by hand still groups sensibly: everything up to
 * the em dash is the phase, the rest is the step within it.
 */

import { stageDueDate } from "@/lib/workflow-engine";
import type { WorkflowStage } from "@/types/workflow";

export type PhaseState = "done" | "current" | "upcoming";

export const PHASE_STATE_LABEL: Record<PhaseState, string> = {
  done: "Closed",
  current: "Current",
  upcoming: "Upcoming",
};

/**
 * Stored in a cycle's `current_phase` to say every phase is shut.
 *
 * Null already means something else — "read the phase off the dates" — so
 * closing the last phase needed a value of its own. Without one, HR could open
 * a phase and never shut it: the only way out of an open phase was to open a
 * different one, and the final phase could not be closed at all.
 */
export const NO_PHASE_OPEN = "__none__";

export interface CyclePhase {
  name: string;
  stageKeys: string[];
  /** When the phase opens — the day after the previous phase's deadline. */
  startDate: string | null;
  /** When the phase closes — the due date of its last stage. */
  dueDate: string | null;
  state: PhaseState;
  stageCount: number;
}

const DAY_MS = 86_400_000;

/** The day after `iso`, in UTC — where one phase ends the next begins. */
function nextDay(iso: string): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);
}

/** "Goals Setting — employee submits" → "Goals Setting". */
export function phaseNameOf(label: string): string {
  const [head] = label.split(/\s+[—–-]\s+/);
  return (head ?? label).trim() || label;
}

/**
 * Group a cycle's stages into phases, and mark the one that is open.
 *
 * `openPhase` is the phase somebody has opened, and it wins outright. Where the
 * cycle actually is, is a decision, not an arithmetic result: the dates say one
 * thing and the work can be somewhere else entirely, and it is the work that
 * matters. Everything before an open phase reads as closed, everything after as
 * upcoming, whatever the calendar says.
 *
 * With no open phase set, the dates decide: the first phase that has not closed,
 * including one whose date has passed while later phases remain — an overrun
 * phase is still where the cycle is, and somebody has to be chased for it.
 *
 * `NO_PHASE_OPEN` is the third case: every phase deliberately shut, which is
 * not the same as having no preference. Between phases — after goal setting
 * closes and before mid-year opens — nothing should read as open.
 */
export function cyclePhases(input: {
  stages: WorkflowStage[];
  cycleStart: string | null;
  todayIso: string;
  /** The phase somebody has opened, by name. Null derives it from the dates. */
  openPhase?: string | null;
}): CyclePhase[] {
  const groups: { name: string; stageKeys: string[]; lastStage: WorkflowStage }[] = [];
  for (const stage of input.stages) {
    const name = phaseNameOf(stage.label);
    const last = groups[groups.length - 1];
    // Consecutive stages sharing a name are one phase; the same name appearing
    // again later is a separate phase rather than a merge across the gap.
    if (last && last.name === name) {
      last.stageKeys.push(stage.key);
      last.lastStage = stage;
    } else {
      groups.push({ name, stageKeys: [stage.key], lastStage: stage });
    }
  }

  const phases: CyclePhase[] = groups.map((g) => ({
    name: g.name,
    stageKeys: g.stageKeys,
    stageCount: g.stageKeys.length,
    startDate: null,
    dueDate: input.cycleStart ? stageDueDate(g.lastStage, input.cycleStart) : null,
    state: "upcoming" as PhaseState,
  }));

  // A phase runs from where the one before it left off to its own deadline, so
  // the board can show a span rather than a single date. The first starts with
  // the cycle.
  let from = input.cycleStart;
  for (const phase of phases) {
    phase.startDate = from;
    from = phase.dueDate ? nextDay(phase.dueDate) : from;
  }

  // Every phase explicitly shut: the dates still say which are behind us, but
  // none of them is open and nobody is being asked to act.
  if (input.openPhase === NO_PHASE_OPEN) {
    for (const phase of phases) {
      phase.state = phase.dueDate !== null && phase.dueDate < input.todayIso ? "done" : "upcoming";
    }
    return phases;
  }

  // Somebody has said where the cycle is: that phase is open, and position in
  // the sequence decides the rest.
  const openIndex = input.openPhase
    ? phases.findIndex((p) => p.name === input.openPhase)
    : -1;
  if (openIndex >= 0) {
    phases.forEach((phase, i) => {
      phase.state = i < openIndex ? "done" : i === openIndex ? "current" : "upcoming";
    });
    return phases;
  }

  // Nothing set: closed = its date has gone, and the first still open is where
  // the cycle reads as being.
  let currentTaken = false;
  for (const phase of phases) {
    const closed = phase.dueDate !== null && phase.dueDate < input.todayIso;
    if (closed) {
      phase.state = "done";
    } else if (!currentTaken) {
      phase.state = "current";
      currentTaken = true;
    }
  }
  // Every phase past its date: the last one is where the cycle stands, not none.
  if (!currentTaken && phases.length > 0) {
    phases[phases.length - 1].state = "current";
  }

  return phases;
}
