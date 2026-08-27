"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAppraisalWorkflow } from "@/lib/workflow-runtime";
import {
  activeStageKeys,
  canAct,
  prevStageKey,
  responsibleUserId,
  stageByKey,
  type StageAction,
} from "@/lib/workflow-engine";
import type { ActionResult } from "@/types/actions";
import { goalWeightError } from "@/lib/performance/goal-weighting";
import { getPerformanceConfig } from "@/lib/performance-config";

const ACTIONS: StageAction[] = ["submit", "approve", "return", "reject"];
const REJECTED = "__rejected__";

/**
 * Why the goals aren't ready for this step, or null when they are.
 *
 * `full` applies the tenant's configured rules — the count and the weights
 * totalling 100% — which is what the goal-setting panel checks before it lets
 * an employee submit. Everybody else only needs there to be goals at all:
 * a manager reviewing, signing off or approving nothing is meaningless, but
 * holding them to the employee's rules would trap them behind a mistake that
 * is not theirs to fix from that step.
 */
async function goalsNotReady(appraisalId: string, full: boolean): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisal_goals")
    .select("weight, kind")
    .eq("appraisal_id", appraisalId);
  const goals = (data ?? []) as { weight: number | null; kind: string }[];
  if (goals.length === 0) {
    return "There are no goals on this appraisal yet, so this step has nothing to act on.";
  }
  if (!full) return null;
  return goalWeightError(goals, await getPerformanceConfig());
}

/**
 * Act on a specific workflow stage. Multiple stages can be active at once when a
 * parallel group is in flight, so the stage key is explicit. Approving/submitting
 * marks the stage complete (auto-progressing through any auto stages that become
 * active); returning reopens the previous stage; rejecting ends the flow.
 */
export async function advanceAppraisalStage(
  appraisalId: string,
  stageKey: string,
  action: StageAction,
): Promise<ActionResult> {
  if (!ACTIONS.includes(action)) return { ok: false, error: "Unknown action." };

  const wf = await getAppraisalWorkflow(appraisalId);
  if (!wf) return { ok: false, error: "No workflow is configured for this appraisal." };
  if (wf.terminal === "rejected") return { ok: false, error: "This appraisal was rejected." };
  if (!wf.activeKeys.includes(stageKey)) return { ok: false, error: "That stage isn't active." };

  const stage = stageByKey(wf.stages, stageKey);
  if (!stage) return { ok: false, error: "Stage not found." };
  // Whose step this is. An administrator may take it for them when the person
  // cannot — off the rig, on leave, or signing on paper — and the event then
  // names both parties so the timeline never reads as the person's own work.
  const mine = wf.userRoles.some((r) => canAct(stage, r));
  if (!mine && !wf.canProxy) {
    return { ok: false, error: "It's not your turn to act on this stage." };
  }
  const onBehalfOf = mine ? null : responsibleUserId(stage.responsibleRole, wf.parties);

  const supabase = createClient();

  // A step that works on the goals cannot be completed when there are none.
  //
  // The employee's submission had two doors into the same transition — the
  // goal-setting panel, which checks the goals first, and this timeline, which
  // did not — so a submit here marked the step done with nothing submitted, and
  // the manager arrived at "review and comment" with nothing to review and no
  // way to hand it back. The employee's own step is held to the full rules, the
  // same ones the panel applies; every other step needs the goals to exist.
  if ((action === "submit" || action === "approve") && stage.editableFields.includes("goals")) {
    const invalid = await goalsNotReady(appraisalId, stage.responsibleRole === "employee");
    if (invalid) return { ok: false, error: invalid };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let completed = [...wf.completedStages];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (action === "reject") {
    if (!stage.allowReject) return { ok: false, error: "Reject isn't allowed at this stage." };
    update.current_stage_key = REJECTED;
  } else if (action === "return") {
    if (!stage.allowReturn) return { ok: false, error: "Return isn't allowed at this stage." };
    const prev = prevStageKey(wf.stages, wf.ctx, stageKey);
    if (prev) completed = completed.filter((k) => k !== prev);
    update.completed_stages = completed;
  } else {
    // submit / approve → complete this stage, then auto-progress.
    if (!completed.includes(stageKey)) completed.push(stageKey);
    let guard = 0;
    while (guard++ < 50) {
      const active = activeStageKeys(wf.stages, wf.ctx, completed);
      const auto = active.find((k) => stageByKey(wf.stages, k)?.autoProgress);
      if (!auto) break;
      completed.push(auto);
    }
    update.completed_stages = completed;
    if (activeStageKeys(wf.stages, wf.ctx, completed).length === 0) update.current_stage_key = "__completed__";
  }

  const { error } = await supabase.from("appraisals").update(update).eq("id", appraisalId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("appraisal_events").insert({
    tenant_id: wf.tenantId,
    appraisal_id: appraisalId,
    actor_id: user?.id ?? null,
    stage: stage.key,
    action: `workflow_${action}`,
    on_behalf_of: onBehalfOf,
  });

  revalidatePath("/performance/appraisals");
  return { ok: true };
}
