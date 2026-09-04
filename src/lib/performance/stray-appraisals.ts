/**
 * Appraisals that belong to nobody in the workflow, and which of them may go.
 *
 * A cycle creates an appraisal for everyone on the roster at launch, and
 * nothing takes it away when the person leaves the roster afterwards: made a
 * contractor, deactivated, stripped of the module. The row stays, the status
 * report excludes it from every figure and puts up a banner saying "clear them
 * when convenient", and there was no way to. So the banner stood for weeks.
 *
 * The rule for what may be cleared is the whole of the risk, so it lives here
 * where it can be tested: an appraisal goes only when it holds nothing at all.
 * Anything with a goal, a step taken, a comment, a plan or a rating stays, and
 * the report says why.
 */

export interface StrayContent {
  goals: number;
  events: number;
  developmentPlans: number;
  competencyRatings: number;
  appeals: number;
  calibrationAdjustments: number;
  /** Continuous entries tied to this appraisal. Unlinked on delete, not lost. */
  continuousLinks: number;
  managerSummary: boolean;
  employeeSummary: boolean;
  rated: boolean;
  discussed: boolean;
  acknowledged: boolean;
}

export interface StrayAppraisal {
  appraisalId: string;
  employeeName: string;
  content: StrayContent;
}

export interface KeptAppraisal {
  appraisalId: string;
  employeeName: string;
  /** What it holds, in words, so HR can see why it was left. */
  holds: string;
}

export interface StrayPartition {
  clearable: StrayAppraisal[];
  kept: KeptAppraisal[];
}

/** Everything that counts as content, with the word for it. */
function contents(c: StrayContent): string[] {
  const out: string[] = [];
  const n = (count: number, word: string) =>
    count > 0 && out.push(`${count} ${word}${count === 1 ? "" : "s"}`);
  n(c.goals, "goal");
  n(c.events, "step");
  n(c.developmentPlans, "development plan");
  n(c.competencyRatings, "competency rating");
  n(c.appeals, "appeal");
  n(c.calibrationAdjustments, "calibration adjustment");
  if (c.managerSummary) out.push("a manager comment");
  if (c.employeeSummary) out.push("a self-assessment");
  if (c.rated) out.push("a rating");
  if (c.discussed) out.push("a recorded discussion");
  if (c.acknowledged) out.push("an acknowledgement");
  return out;
}

/**
 * Empty means empty: nothing written, nothing taken, nothing rated.
 *
 * Continuous entries are deliberately not counted. They belong to the person,
 * not the appraisal, and the link is dropped rather than the entry, so an
 * appraisal that merely has updates pointing at it still goes.
 */
export function isEmptyAppraisal(c: StrayContent): boolean {
  return contents(c).length === 0;
}

export function describeContent(c: StrayContent): string {
  const parts = contents(c);
  if (parts.length === 0) return "nothing";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Which may go and which stay, with the reason for each that stays. */
export function partitionStray(rows: StrayAppraisal[]): StrayPartition {
  const clearable: StrayAppraisal[] = [];
  const kept: KeptAppraisal[] = [];
  for (const r of rows) {
    if (isEmptyAppraisal(r.content)) clearable.push(r);
    else
      kept.push({
        appraisalId: r.appraisalId,
        employeeName: r.employeeName,
        holds: describeContent(r.content),
      });
  }
  return { clearable, kept };
}

/** What the button reports afterwards. */
export interface ClearStrayResult {
  ok: boolean;
  error?: string;
  removed: number;
  kept: KeptAppraisal[];
}
