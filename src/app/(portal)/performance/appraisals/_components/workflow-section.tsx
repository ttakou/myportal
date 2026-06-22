import { getAppraisalWorkflow } from "@/lib/workflow-runtime";
import {
  COMPLETED,
  REJECTED,
  applicableStages,
  canAct,
  progressPercent,
  stageByKey,
} from "@/lib/workflow-engine";
import { STAGE_ROLE_LABEL } from "@/types/workflow";
import { WorkflowTimeline } from "./workflow-timeline";

/**
 * Server wrapper: resolves the configured workflow for an appraisal and renders
 * the timeline. Renders nothing for appraisals without a configured workflow,
 * so legacy cycles are unaffected.
 */
export async function WorkflowSection({
  appraisalId,
  heading,
}: {
  appraisalId: string;
  heading?: string;
}) {
  const wf = await getAppraisalWorkflow(appraisalId);
  if (!wf) return null;

  const applicable = applicableStages(wf.stages, wf.ctx);
  const stage = stageByKey(wf.stages, wf.currentStageKey);
  const canActNow = !!stage && wf.userRoles.some((r) => canAct(stage, r));

  return (
    <WorkflowTimeline
      appraisalId={wf.appraisalId}
      heading={heading}
      steps={applicable.map((s) => ({
        key: s.key,
        label: s.label,
        responsible: STAGE_ROLE_LABEL[s.responsibleRole],
      }))}
      currentKey={wf.currentStageKey}
      progress={progressPercent(wf.stages, wf.ctx, wf.currentStageKey)}
      completed={wf.currentStageKey === COMPLETED}
      rejected={wf.currentStageKey === REJECTED}
      canActNow={canActNow}
      primaryAction={stage?.allowApprove ? "approve" : "submit"}
      primaryLabel={stage?.allowApprove ? "Approve" : "Submit"}
      allowReturn={!!stage?.allowReturn}
      allowReject={!!stage?.allowReject}
      currentResponsible={stage ? STAGE_ROLE_LABEL[stage.responsibleRole] : null}
    />
  );
}
