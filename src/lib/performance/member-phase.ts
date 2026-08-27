/**
 * Which phase one person is in.
 *
 * The cycle has a phase — the one HR opened — and that is the answer to "where
 * is the process". It is not the answer to "where is Patrick": people run
 * behind, and a manager looking at their line needs to see who is still in goal
 * setting while the cycle has moved to mid-year. That is read from the person's
 * own completed steps, not from the cycle.
 */

import { activeStageKeys, applicableStages, stageByKey } from "@/lib/workflow-engine";
import type { EmployeeContext } from "@/lib/workflow-engine";
import type { StageRole, WorkflowStage } from "@/types/workflow";
import { phaseNameOf } from "./cycle-phases";

export interface MemberPhase {
  /** The phase they are working in, by name. Null once they have finished. */
  phase: string | null;
  /** Its place in the sequence, 1-based. Null when there is no phase to be in. */
  phaseNumber: number | null;
  /** How many phases the workflow has, for "2 of 5". */
  phaseCount: number;
  /** The step they are on within that phase. */
  stageLabel: string | null;
  /** Whose move it is. */
  owner: StageRole | null;
  /** True when every step that applies to them is done. */
  finished: boolean;
}

const NOWHERE: MemberPhase = {
  phase: null,
  phaseNumber: null,
  phaseCount: 0,
  stageLabel: null,
  owner: null,
  finished: false,
};

/** The phases of a workflow, in order, by name. */
export function phaseNames(stages: WorkflowStage[], ctx: EmployeeContext): string[] {
  const names: string[] = [];
  for (const stage of applicableStages(stages, ctx)) {
    const name = phaseNameOf(stage.label);
    if (names[names.length - 1] !== name && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * Where this person stands.
 *
 * Several steps can be live at once when a phase runs a parallel group, so the
 * earliest one wins: it is the one holding the rest up, and the one a manager
 * is being asked about.
 */
export function memberPhase(
  stages: WorkflowStage[],
  ctx: EmployeeContext,
  completedStages: string[],
): MemberPhase {
  if (stages.length === 0) return NOWHERE;
  const names = phaseNames(stages, ctx);
  const active = activeStageKeys(stages, ctx, completedStages);

  if (active.length === 0) {
    return { ...NOWHERE, phaseCount: names.length, finished: true };
  }

  // Earliest live step in process order.
  const order = new Map(stages.map((s, i) => [s.key, i]));
  const key = [...active].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))[0];
  const stage = stageByKey(stages, key);
  if (!stage) return { ...NOWHERE, phaseCount: names.length };

  const phase = phaseNameOf(stage.label);
  const index = names.indexOf(phase);
  return {
    phase,
    phaseNumber: index === -1 ? null : index + 1,
    phaseCount: names.length,
    stageLabel: stage.label,
    owner: stage.responsibleRole,
    finished: false,
  };
}
