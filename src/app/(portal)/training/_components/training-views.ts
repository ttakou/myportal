// Single source of truth for the Training & Competence module's sub-views.
// The sidebar renders these as an indented submenu (gated by role) and the
// page reads the active key from the `?view=` query param.

export type TrainingGroup =
  | "My Training"
  | "Team Training"
  | "HR Administration"
  | "Reports";

export type TrainingViewKey =
  // My Training
  | "dashboard"
  | "mandatory"
  | "gaps"
  | "idp"
  | "browse"
  | "requests"
  | "open-sessions"
  | "my-plan"
  | "calendar"
  | "history"
  | "certificates"
  | "my-evaluations"
  | "my-competencies"
  // Team Training
  | "team-compliance"
  | "team-requests"
  | "dept-needs"
  | "team-plan"
  // HR Administration
  | "assign"
  | "scheduler"
  | "record-training"
  | "annual-plan"
  | "matrix"
  | "catalogue"
  | "sessions"
  | "course-history"
  | "participants"
  | "providers"
  | "trainers"
  | "budgets"
  | "evaluations"
  | "competencies"
  | "competency-matrix"
  | "competency-holders"
  // Reports
  | "rpt-compliance"
  | "rpt-plan-progress"
  | "rpt-costs"
  | "rpt-expiring"
  | "rpt-effectiveness"
  | "rpt-origins";

export interface TrainingView {
  key: TrainingViewKey;
  label: string;
  /** lucide-react icon name (PascalCase). */
  icon: string;
  group: TrainingGroup;
}

export const TRAINING_VIEWS: TrainingView[] = [
  // My Training (everyone with the module)
  { key: "dashboard", label: "My Training Dashboard", icon: "LayoutDashboard", group: "My Training" },
  { key: "mandatory", label: "Mandatory Training", icon: "ShieldAlert", group: "My Training" },
  { key: "my-competencies", label: "My Competencies", icon: "Sparkles", group: "My Training" },
  { key: "gaps", label: "Competency Gaps", icon: "TriangleAlert", group: "My Training" },
  { key: "idp", label: "Development Plan", icon: "Compass", group: "My Training" },
  { key: "browse", label: "Browse Courses", icon: "BookOpen", group: "My Training" },
  { key: "requests", label: "Individual Training Requests", icon: "FilePlus2", group: "My Training" },
  { key: "open-sessions", label: "Open Sessions", icon: "CalendarPlus", group: "My Training" },
  { key: "my-plan", label: "My Training Plan", icon: "ListChecks", group: "My Training" },
  { key: "calendar", label: "Training Calendar", icon: "CalendarDays", group: "My Training" },
  { key: "history", label: "Training History", icon: "History", group: "My Training" },
  { key: "certificates", label: "Certificates", icon: "Award", group: "My Training" },
  { key: "my-evaluations", label: "Training Evaluations", icon: "Star", group: "My Training" },
  // Team Training (managers + HR)
  { key: "team-compliance", label: "Team Compliance", icon: "ShieldCheck", group: "Team Training" },
  { key: "team-requests", label: "Training Requests", icon: "Inbox", group: "Team Training" },
  { key: "dept-needs", label: "Department Training Needs", icon: "Target", group: "Team Training" },
  { key: "team-plan", label: "Team Training Plan", icon: "ClipboardList", group: "Team Training" },
  // HR Administration (HR)
  { key: "assign", label: "Assign / Request Training", icon: "ClipboardPlus", group: "HR Administration" },
  { key: "scheduler", label: "Training Scheduler", icon: "CalendarClock", group: "HR Administration" },
  { key: "record-training", label: "Record Training", icon: "FileCheck2", group: "HR Administration" },
  { key: "annual-plan", label: "Annual Training Plan", icon: "CalendarRange", group: "HR Administration" },
  { key: "matrix", label: "Statutory Training Matrix", icon: "Grid3x3", group: "HR Administration" },
  { key: "catalogue", label: "Training Catalogue", icon: "BookOpen", group: "HR Administration" },
  { key: "sessions", label: "Training Sessions", icon: "CalendarClock", group: "HR Administration" },
  { key: "course-history", label: "Course History", icon: "History", group: "HR Administration" },
  { key: "participants", label: "Participants", icon: "Users", group: "HR Administration" },
  { key: "providers", label: "Training Providers", icon: "Building2", group: "HR Administration" },
  { key: "trainers", label: "Trainers", icon: "GraduationCap", group: "HR Administration" },
  { key: "budgets", label: "Budgets", icon: "Wallet", group: "HR Administration" },
  { key: "evaluations", label: "Evaluations", icon: "Star", group: "HR Administration" },
  { key: "competencies", label: "Competency Catalogue", icon: "Layers", group: "HR Administration" },
  { key: "competency-matrix", label: "Competency Matrix", icon: "Network", group: "HR Administration" },
  { key: "competency-holders", label: "Competency Holders", icon: "Users", group: "HR Administration" },
  // Reports (HR)
  { key: "rpt-compliance", label: "Statutory Compliance", icon: "ShieldCheck", group: "Reports" },
  { key: "rpt-plan-progress", label: "Training Plan Progress", icon: "TrendingUp", group: "Reports" },
  { key: "rpt-costs", label: "Training Costs", icon: "DollarSign", group: "Reports" },
  { key: "rpt-expiring", label: "Expiring Certifications", icon: "CalendarX", group: "Reports" },
  { key: "rpt-effectiveness", label: "Training Effectiveness", icon: "BarChart3", group: "Reports" },
  { key: "rpt-origins", label: "Requests by Origin", icon: "GitBranch", group: "Reports" },
];

/** Views implemented in the current phase (others render a "planned" notice). */
export const IMPLEMENTED_VIEWS: ReadonlySet<TrainingViewKey> = new Set<TrainingViewKey>([
  "dashboard",
  "mandatory",
  "gaps",
  "idp",
  "browse",
  "requests",
  "open-sessions",
  "my-plan",
  "calendar",
  "history",
  "certificates",
  "my-evaluations",
  "catalogue",
  "matrix",
  "sessions",
  "course-history",
  "participants",
  "providers",
  "trainers",
  "annual-plan",
  "budgets",
  "evaluations",
  "team-compliance",
  "team-requests",
  "dept-needs",
  "team-plan",
  "assign",
  "scheduler",
  "record-training",
  "rpt-compliance",
  "rpt-plan-progress",
  "rpt-costs",
  "rpt-expiring",
  "rpt-effectiveness",
  "rpt-origins",
  "my-competencies",
  "competencies",
  "competency-matrix",
  "competency-holders",
]);

export const TRAINING_VIEW_KEYS = TRAINING_VIEWS.map((v) => v.key);
export const DEFAULT_TRAINING_VIEW: TrainingViewKey = "dashboard";

export function resolveTrainingView(raw: string | null | undefined): TrainingViewKey {
  if (raw && (TRAINING_VIEW_KEYS as string[]).includes(raw)) return raw as TrainingViewKey;
  return DEFAULT_TRAINING_VIEW;
}

export interface TrainingAccess {
  /** Manages a team (has direct reports) — sees Team Training. */
  isManager: boolean;
  /** Training Admin (training:manage) — sees HR Administration + Reports. */
  isTrainingAdmin: boolean;
}

const GROUP_ACCESS: Record<TrainingGroup, (o: TrainingAccess) => boolean> = {
  "My Training": () => true,
  "Team Training": (o) => o.isManager || o.isTrainingAdmin,
  "HR Administration": (o) => o.isTrainingAdmin,
  Reports: (o) => o.isTrainingAdmin,
};

/** Whether the current user can open a given view (used to gate the page). */
export function canSeeTrainingView(key: TrainingViewKey, access: TrainingAccess): boolean {
  const view = TRAINING_VIEWS.find((v) => v.key === key);
  return view ? GROUP_ACCESS[view.group](access) : false;
}

export interface TrainingNavItem {
  key: TrainingViewKey;
  label: string;
  icon: string;
  href: string;
  /** Macro-section the item is grouped under in the sidebar. */
  section: string;
  /** All `?view=` values that keep this entry highlighted (the hub's tabs). */
  matchViews?: string[];
}

// The four functional groups collapse into three sidebar sections: a user's own
// training under "My Training", the team functions a manager has for their
// direct reports under "My Team Training", and the admin tools under
// "Training Admin Console".
const SECTION: Record<TrainingGroup, string> = {
  "My Training": "My Training",
  "Team Training": "My Team Training",
  "HR Administration": "Training Admin Console",
  Reports: "Training Admin Console",
};

/**
 * Submenu for the sidebar: one entry per hub (consolidated), gated by role and
 * grouped into sections. An entry stays highlighted while any of its tabs is
 * the active view.
 */
export function trainingSubmenu(opts: TrainingAccess): TrainingNavItem[] {
  return TRAINING_HUBS.filter((h) => GROUP_ACCESS[h.group](opts)).map((h) => ({
    key: h.key,
    label: h.label,
    icon: h.icon,
    href: `/training?view=${h.key}`,
    section: SECTION[h.group],
    matchViews: h.tabs?.map((t) => t.key),
  }));
}

// =============================================================================
// Consolidated sidebar: the 39 flat views collapse into ~19 "hubs". A hub is a
// sidebar entry whose sub-views render as a tab bar on the page; each tab links
// straight to the original `?view=` key, so every legacy deep-link still works
// and each tab keeps its own lazy data fetch. Access is unchanged — a hub only
// groups views that share the same GROUP_ACCESS gate.
// =============================================================================

export interface TrainingHubTab {
  key: TrainingViewKey;
  label: string;
}

export interface TrainingHub {
  /** Landing view — the tab shown when the sidebar entry is clicked. */
  key: TrainingViewKey;
  label: string;
  icon: string;
  group: TrainingGroup;
  /** All views the hub contains (first = landing). Absent = single view. */
  tabs?: TrainingHubTab[];
}

export const TRAINING_HUBS: TrainingHub[] = [
  // My Training (13 views → 6 entries)
  { key: "dashboard", label: "My Training Dashboard", icon: "LayoutDashboard", group: "My Training" },
  {
    key: "mandatory", label: "My Compliance", icon: "ShieldAlert", group: "My Training",
    tabs: [
      { key: "mandatory", label: "Mandatory Training" },
      { key: "gaps", label: "Competency Gaps" },
    ],
  },
  {
    key: "idp", label: "My Development", icon: "Compass", group: "My Training",
    tabs: [
      { key: "idp", label: "Development Plan" },
      { key: "my-competencies", label: "My Competencies" },
    ],
  },
  {
    key: "browse", label: "Find Training", icon: "BookOpen", group: "My Training",
    tabs: [
      { key: "browse", label: "Browse Courses" },
      { key: "open-sessions", label: "Open Sessions" },
      { key: "requests", label: "My Requests" },
    ],
  },
  {
    key: "my-plan", label: "My Plan & Calendar", icon: "ListChecks", group: "My Training",
    tabs: [
      { key: "my-plan", label: "My Plan" },
      { key: "calendar", label: "Calendar" },
    ],
  },
  {
    key: "history", label: "My Records", icon: "History", group: "My Training",
    tabs: [
      { key: "history", label: "Training History" },
      { key: "certificates", label: "Certificates" },
      { key: "my-evaluations", label: "Evaluations" },
    ],
  },
  // Team Training (4 views → 3 entries)
  { key: "team-compliance", label: "Team Compliance", icon: "ShieldCheck", group: "Team Training" },
  { key: "team-requests", label: "Training Requests", icon: "Inbox", group: "Team Training" },
  {
    key: "team-plan", label: "Team Plan & Needs", icon: "ClipboardList", group: "Team Training",
    tabs: [
      { key: "team-plan", label: "Team Plan" },
      { key: "dept-needs", label: "Department Needs" },
    ],
  },
  // Training Admin Console (22 views → 10 entries)
  {
    key: "assign", label: "Requests & Assignment", icon: "ClipboardPlus", group: "HR Administration",
    tabs: [
      { key: "assign", label: "Assign / Requests" },
      { key: "rpt-origins", label: "Requests by Origin" },
    ],
  },
  { key: "scheduler", label: "Training Scheduler", icon: "CalendarClock", group: "HR Administration" },
  {
    key: "sessions", label: "Sessions & History", icon: "CalendarClock", group: "HR Administration",
    tabs: [
      { key: "sessions", label: "Sessions" },
      { key: "participants", label: "Participants" },
      { key: "course-history", label: "Course History" },
      { key: "record-training", label: "Record Training" },
    ],
  },
  {
    key: "annual-plan", label: "Annual Plan", icon: "CalendarRange", group: "HR Administration",
    tabs: [
      { key: "annual-plan", label: "Plan" },
      { key: "rpt-plan-progress", label: "Progress" },
    ],
  },
  {
    key: "matrix", label: "Statutory Training", icon: "Grid3x3", group: "HR Administration",
    tabs: [
      { key: "matrix", label: "Requirements Matrix" },
      { key: "rpt-compliance", label: "Compliance" },
      { key: "rpt-expiring", label: "Expiring Certifications" },
    ],
  },
  { key: "catalogue", label: "Training Catalogue", icon: "BookOpen", group: "HR Administration" },
  {
    key: "providers", label: "Providers & Trainers", icon: "Building2", group: "HR Administration",
    tabs: [
      { key: "providers", label: "Providers" },
      { key: "trainers", label: "Trainers" },
    ],
  },
  {
    key: "budgets", label: "Budget & Costs", icon: "Wallet", group: "HR Administration",
    tabs: [
      { key: "budgets", label: "Budgets" },
      { key: "rpt-costs", label: "Costs Report" },
    ],
  },
  {
    key: "competencies", label: "Competencies", icon: "Layers", group: "HR Administration",
    tabs: [
      { key: "competencies", label: "Catalogue" },
      { key: "competency-matrix", label: "Employee Matrix" },
      { key: "competency-holders", label: "Holders" },
    ],
  },
  {
    key: "evaluations", label: "Evaluations", icon: "Star", group: "HR Administration",
    tabs: [
      { key: "evaluations", label: "Sessions & Responses" },
      { key: "rpt-effectiveness", label: "Effectiveness" },
    ],
  },
];

/** The hub a view belongs to (as landing view or tab), if any. */
export function hubForView(key: TrainingViewKey): TrainingHub | null {
  return (
    TRAINING_HUBS.find((h) => h.key === key || h.tabs?.some((t) => t.key === key)) ?? null
  );
}
