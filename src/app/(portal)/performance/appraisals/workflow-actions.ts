"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAppraisalWorkflow } from "@/lib/workflow-runtime";
import {
  activeStageKeys,
  canAct,
  prevStageKey,
  stageByKey,
  type StageAction,
} from "@/lib/workflow-engine";
import type { ActionResult } from "@/types/actions";

const ACTIONS: StageAction[] = ["submit", "approve", "return", "reject"];
const REJECTED = "__rejected__";

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
  if (!wf.userRoles.some((r) => canAct(stage, r))) {
    return { ok: false, error: "It's not your turn to act on this stage." };
  }

  const supabase = createClient();
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
  });

  revalidatePath("/performance/appraisals");
  return { ok: true };
}
