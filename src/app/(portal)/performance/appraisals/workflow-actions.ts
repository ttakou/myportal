"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAppraisalWorkflow } from "@/lib/workflow-runtime";
import {
  REJECTED,
  canAct,
  skipAutoStages,
  stageByKey,
  transition,
  type StageAction,
} from "@/lib/workflow-engine";
import type { ActionResult } from "@/types/actions";

const ACTIONS: StageAction[] = ["submit", "approve", "return", "reject"];

/**
 * Advance a configured appraisal through its workflow. Only the role
 * responsible for the current stage may act; the engine computes the next
 * stage and we persist it + log an event. The legacy status machine is left
 * untouched — this runs alongside it for template-driven cycles.
 */
export async function advanceAppraisalStage(
  appraisalId: string,
  action: StageAction,
): Promise<ActionResult> {
  if (!ACTIONS.includes(action)) return { ok: false, error: "Unknown action." };

  const wf = await getAppraisalWorkflow(appraisalId);
  if (!wf) return { ok: false, error: "No workflow is configured for this appraisal." };

  const stage = stageByKey(wf.stages, wf.currentStageKey);
  if (!stage) return { ok: false, error: "This appraisal isn't on a known stage." };
  if (!wf.userRoles.some((r) => canAct(stage, r))) {
    return { ok: false, error: "It's not your turn to act on this stage." };
  }

  const result = transition(wf.stages, wf.ctx, wf.currentStageKey, action);
  if (result.nextKey === wf.currentStageKey && action !== "submit" && action !== "approve") {
    return { ok: false, error: "That action isn't allowed at this stage." };
  }
  // Forward moves skip any auto-progress stages so they don't stall the flow.
  const nextKey =
    result.nextKey === REJECTED
      ? result.nextKey
      : skipAutoStages(wf.stages, wf.ctx, result.nextKey);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("appraisals")
    .update({ current_stage_key: nextKey, updated_at: new Date().toISOString() })
    .eq("id", appraisalId);
  if (error) return { ok: false, error: error.message };

  // Best-effort audit trail (don't fail the action if the event insert is denied).
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
