/**
 * The HR console, divided.
 *
 * It was one page: the cycle strip, four dashboard cards, the cycle-creation
 * form with its rating bands, the cycle table with phases, the completion tile,
 * every appraisal in the cycle, the HR queue, the rating-band manager, the
 * department objectives, the competency framework and the calibration panel,
 * top to bottom. Finding the competency editor meant scrolling past a form for
 * creating a cycle nobody was creating.
 *
 * Each concern is a tab now, addressed in the URL so a link lands on it. The
 * list lives here, pure, the way the sidebar's does: the page reads it, the
 * tests read it, and a tab added here appears everywhere it should.
 */

export type HrConsoleTab =
  | "dashboard"
  | "cycle"
  | "appraisals"
  | "competencies"
  | "objectives"
  | "bands"
  | "calibration";

export interface HrConsoleTabItem {
  key: HrConsoleTab;
  label: string;
  /** One line under the tab bar, so a first visit knows what it is looking at. */
  description: string;
}

export const HR_CONSOLE_TABS: HrConsoleTabItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "How far the cycle has got, and what is waiting on HR.",
  },
  {
    key: "cycle",
    label: "Appraisal cycle",
    description: "Create a cycle, open and close its phases, add people who are missing.",
  },
  {
    key: "appraisals",
    label: "Appraisals",
    description: "Every participant in the cycle with their stage and rating; export to CSV.",
  },
  {
    key: "competencies",
    label: "Competency framework",
    description: "The competencies every appraisal rates, and their weight in the score.",
  },
  {
    key: "objectives",
    label: "Department objectives",
    description: "What each department is aiming at this year, for goals to align to.",
  },
  {
    key: "bands",
    label: "Rating bands",
    description: "How a final score maps to a rating label, per cycle.",
  },
  {
    key: "calibration",
    label: "Calibration",
    description: "Ratings across departments side by side, and the adjustments made.",
  },
];

export const DEFAULT_HR_TAB: HrConsoleTab = "dashboard";

/** A raw `?tab=` value resolved to a known tab, else the default. */
export function resolveHrTab(raw: string | null | undefined): HrConsoleTab {
  return HR_CONSOLE_TABS.some((t) => t.key === raw) ? (raw as HrConsoleTab) : DEFAULT_HR_TAB;
}

/**
 * The link to a tab, keeping the cycle the visitor is looking at.
 *
 * The default tab carries no `tab=` parameter, so the sidebar's plain HR
 * console link and the dashboard tab are one URL and the sidebar keeps
 * matching it as active.
 */
export function hrTabHref(tab: HrConsoleTab, cycleId?: string | null): string {
  const params = new URLSearchParams({ view: "hr" });
  if (tab !== DEFAULT_HR_TAB) params.set("tab", tab);
  if (cycleId) params.set("cycle", cycleId);
  return `/performance/appraisals?${params.toString()}`;
}
