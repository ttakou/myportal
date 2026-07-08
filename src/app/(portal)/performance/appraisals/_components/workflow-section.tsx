import { getAppraisalWorkflow } from "@/lib/workflow-runtime";
import { applicableStages, canAct, stageByKey } from "@/lib/workflow-engine";
import { STAGE_ROLE_LABEL, type WorkflowStage } from "@/types/workflow";
import { WorkflowTimeline, type Step, type Actionable } from "./workflow-timeline";

/**
 * Server wrapper: resolves the configured workflow for an appraisal and renders
 * the timeline. Renders nothing for appraisals without a configured workflow.
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
  const completed = new Set(wf.completedStages);
  const active = new Set(wf.activeKeys);

  const steps: Step[] = applicable.map((s) => ({
    key: s.key,
    label: s.label,
    responsible: STAGE_ROLE_LABEL[s.responsibleRole],
    status: completed.has(s.key) ? "done" : active.has(s.key) ? "active" : "upcoming",
  }));

  const actionable: Actionable[] = wf.activeKeys
    .map((k) => stageByKey(wf.stages, k))
    .filter((s): s is WorkflowStage => !!s && wf.userRoles.some((r) => canAct(s, r)))
    .map((s) => ({
      key: s.key,
      label: s.label,
      primaryAction: s.allowApprove ? "approve" : "submit",
      primaryLabel: s.allowApprove ? "Approve" : "Submit",
      allowReturn: s.allowReturn,
      allowReject: s.allowReject,
    }));

  // Whom we're waiting on (active stages the viewer can't action).
  const waitingOn = wf.activeKeys
    .map((k) => stageByKey(wf.stages, k))
    .filter((s): s is WorkflowStage => !!s && !wf.userRoles.some((r) => canAct(s, r)))
    .map((s) => STAGE_ROLE_LABEL[s.responsibleRole]);

  const progress = applicable.length ? Math.round((completed.size / applicable.length) * 100) : 0;

  return (
    <WorkflowTimeline
      appraisalId={wf.appraisalId}
      heading={heading}
      steps={steps}
      actionable={actionable}
      waitingOn={[...new Set(waitingOn)]}
      progress={progress}
      completed={wf.terminal === "completed"}
      rejected={wf.terminal === "rejected"}
    />
  );
}
