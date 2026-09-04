import { getAppraisal } from "@/lib/appraisals";
import { getAppraisalWorkflow, type AppraisalWorkflow } from "@/lib/workflow-runtime";
import type { AppraisalGoal } from "@/types/appraisal";
import { applicableStages, canAct, stageByKey } from "@/lib/workflow-engine";
import { actingForLabel, type PartyNames } from "@/lib/performance/proxy";
import { STAGE_ROLE_LABEL, type WorkflowStage } from "@/types/workflow";
import { WorkflowTimeline, type Step, type Actionable } from "./workflow-timeline";

/**
 * Server wrapper: resolves the configured workflow for an appraisal and renders
 * the timeline. Renders nothing for appraisals without a configured workflow.
 *
 * `partyNames` is for the pages that know whose appraisal this is — the proxy
 * buttons then say whose step is being taken rather than only which role's.
 */
export async function WorkflowSection({
  appraisalId,
  heading,
  partyNames,
  workflow,
  goals: givenGoals,
}: {
  appraisalId: string;
  heading?: string;
  partyNames?: PartyNames;
  /**
   * Already resolved by the caller — a page listing several appraisals
   * resolves them all in one pass rather than one round trip each here.
   * `null` means resolved and found to have no workflow.
   */
  workflow?: AppraisalWorkflow | null;
  /** The goals, when the caller already holds them. */
  goals?: AppraisalGoal[];
}) {
  const wf = workflow === undefined ? await getAppraisalWorkflow(appraisalId) : workflow;
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

  const mine = (s: WorkflowStage) => wf.userRoles.some((r) => canAct(s, r));
  const liveStages = wf.activeKeys
    .map((k) => stageByKey(wf.stages, k))
    .filter((s): s is WorkflowStage => !!s);

  // An administrator can take somebody else's step for them; the button says so
  // rather than pretending the step is theirs.
  const actionable: Actionable[] = liveStages
    .filter((s) => mine(s) || wf.canProxy)
    .map((s) => ({
      key: s.key,
      label: s.label,
      primaryAction: s.allowApprove ? "approve" : "submit",
      primaryLabel: s.allowApprove ? "Approve" : "Submit",
      allowReturn: s.allowReturn,
      allowReject: s.allowReject,
      actingFor: mine(s) ? null : actingForLabel(s.responsibleRole, partyNames),
    }));

  // Whom we're waiting on (active stages the viewer isn't the owner of).
  const waitingOn = liveStages
    .filter((s) => !mine(s))
    .map((s) => STAGE_ROLE_LABEL[s.responsibleRole]);

  const progress = applicable.length ? Math.round((completed.size / applicable.length) * 100) : 0;

  // What the live step is actually about. A manager sent to "review and
  // comment" was shown a timeline and two buttons and nothing to review — the
  // goals lived in another panel, on another screen for anyone reaching this
  // card from the workflow list. Fetched only when a live step works on them.
  const needsGoals = liveStages.some((s) => s.editableFields.includes("goals"));
  const goals = !needsGoals
    ? []
    : (givenGoals ?? (await getAppraisal(wf.appraisalId))?.goals ?? []);

  return (
    <WorkflowTimeline
      goals={goals.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        weight: g.weight,
        deadline: g.deadline,
        successIndicator: g.success_indicator,
        selfRating: g.employee_self_rating,
        employeeProgress: g.employee_progress,
        progressPercent: g.progress_percent,
      }))}
      showGoals={needsGoals}
      appraisalId={wf.appraisalId}
      heading={heading}
      steps={steps}
      actionable={actionable}
      waitingOn={[...new Set(waitingOn)]}
      progress={progress}
      isProxy={wf.canProxy && actionable.some((a) => a.actingFor)}
      proxyFor={partyNames?.employee ?? null}
      completed={wf.terminal === "completed"}
      rejected={wf.terminal === "rejected"}
    />
  );
}
