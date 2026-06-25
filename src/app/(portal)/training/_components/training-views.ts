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
  | "record-training"
  | "annual-plan"
  | "matrix"
  | "catalogue"
  | "sessions"
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
  { key: "record-training", label: "Record Training", icon: "FileCheck2", group: "HR Administration" },
  { key: "annual-plan", label: "Annual Training Plan", icon: "CalendarRange", group: "HR Administration" },
  { key: "matrix", label: "Statutory Training Matrix", icon: "Grid3x3", group: "HR Administration" },
  { key: "catalogue", label: "Training Catalogue", icon: "BookOpen", group: "HR Administration" },
  { key: "sessions", label: "Training Sessions", icon: "CalendarClock", group: "HR Administration" },
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
}

// The four functional groups collapse into two sidebar sections: everything a
// user/manager does sits under "User Training"; the admin tools under
// "Training Admin Console".
const SECTION: Record<TrainingGroup, string> = {
  "My Training": "User Training",
  "Team Training": "User Training",
  "HR Administration": "Training Admin Console",
  Reports: "Training Admin Console",
};

/** Submenu for the sidebar, gated by role and grouped into two sections. */
export function trainingSubmenu(opts: TrainingAccess): TrainingNavItem[] {
  return TRAINING_VIEWS.filter((v) => GROUP_ACCESS[v.group](opts)).map((v) => ({
    key: v.key,
    label: v.label,
    icon: v.icon,
    href: `/training?view=${v.key}`,
    section: SECTION[v.group],
  }));
}
