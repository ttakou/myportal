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

export interface CyclePhase {
  name: string;
  stageKeys: string[];
  /** When the phase closes — the due date of its last stage. */
  dueDate: string | null;
  state: PhaseState;
  stageCount: number;
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

  const phases = groups.map((g) => ({
    name: g.name,
    stageKeys: g.stageKeys,
    stageCount: g.stageKeys.length,
    dueDate: input.cycleStart ? stageDueDate(g.lastStage, input.cycleStart) : null,
    state: "upcoming" as PhaseState,
  }));

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
