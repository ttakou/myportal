/**
 * Who each member of staff reports to, beside who reviews them this cycle.
 *
 * The reporting line lives on the profile and is edited in the admin centre,
 * one person at a time, on a screen that shows nothing about appraisals. The
 * reviewer lives on the appraisal and is edited on the status report, which
 * shows nothing about the reporting line. So the two drifted, and nobody had a
 * view of the whole workforce that put the two side by side and said where
 * they disagreed. This is that view, shaped here so the counting is testable.
 */

export interface ReportingLineRow {
  profileId: string;
  name: string;
  department: string | null;
  jobTitle: string | null;
  /** The reporting line: `profiles.manager_id`. */
  managerId: string | null;
  managerName: string | null;
  /** This cycle's appraisal, when the person holds one. */
  appraisalId: string | null;
  /** Who reviews that appraisal: `appraisals.manager_id`. */
  reviewerId: string | null;
  reviewerName: string | null;
}

export type ReportingLineIssue =
  /** Nobody on the profile. */
  | "no_manager"
  /** In the cycle, but the appraisal names nobody. */
  | "no_reviewer"
  /** The appraisal's reviewer is not the profile's manager. */
  | "differs";

/** What is wrong with one row, if anything. Empty means the two agree. */
export function rowIssues(row: ReportingLineRow): ReportingLineIssue[] {
  const out: ReportingLineIssue[] = [];
  if (!row.managerId) out.push("no_manager");
  if (row.appraisalId) {
    if (!row.reviewerId) out.push("no_reviewer");
    else if (row.managerId && row.reviewerId !== row.managerId) out.push("differs");
  }
  return out;
}

export interface ReportingLineSummary {
  staff: number;
  noManager: number;
  noReviewer: number;
  differs: number;
  /** Rows with nothing wrong. */
  consistent: number;
}

export function summariseReportingLines(rows: ReportingLineRow[]): ReportingLineSummary {
  let noManager = 0;
  let noReviewer = 0;
  let differs = 0;
  let consistent = 0;
  for (const r of rows) {
    const issues = rowIssues(r);
    if (issues.length === 0) consistent++;
    if (issues.includes("no_manager")) noManager++;
    if (issues.includes("no_reviewer")) noReviewer++;
    if (issues.includes("differs")) differs++;
  }
  return { staff: rows.length, noManager, noReviewer, differs, consistent };
}

export type ReportingLineFilter = "all" | ReportingLineIssue;

export function filterReportingLines(
  rows: ReportingLineRow[],
  filter: ReportingLineFilter,
  query: string,
): ReportingLineRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (filter !== "all" && !rowIssues(r).includes(filter)) return false;
    if (!q) return true;
    return [r.name, r.department, r.jobTitle, r.managerName, r.reviewerName]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });
}

/** By name, the way somebody arrives knowing them. */
export function sortReportingLines(rows: ReportingLineRow[]): ReportingLineRow[] {
  return [...rows].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }),
  );
}
