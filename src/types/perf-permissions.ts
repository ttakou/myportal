/**
 * Configurable permission matrix for the Performance module (client-safe).
 *
 * The form-template builder already governs per-section *visibility* and
 * *editability* (`FormSection.visibleRoles` / `editableRoles`). This matrix
 * owns the cross-cutting capabilities and sensitive-field visibility that sit
 * outside any single section — who may see scores, see comments, modify
 * ratings, reopen an assessment, take part in calibration, export reports, and
 * view the salary / promotion / succession recommendations.
 *
 * A matrix is `{ [role]: { [capability]: boolean } }`. A user's effective
 * capability is the OR across every role they hold for the appraisal in hand
 * (resolved server-side in `@/lib/perf-permissions`). No server-only imports
 * here, so the matrix editor (a client component) can share these constants.
 */

export type PermRole =
  | "employee"
  | "line_manager"
  | "second_level"
  | "functional_manager"
  | "project_manager"
  | "hr_business_partner"
  | "hr_admin"
  | "calibration_committee"
  | "executive"
  | "system_admin";

export const PERM_ROLES: PermRole[] = [
  "employee",
  "line_manager",
  "second_level",
  "functional_manager",
  "project_manager",
  "hr_business_partner",
  "hr_admin",
  "calibration_committee",
  "executive",
  "system_admin",
];

export const PERM_ROLE_LABEL: Record<PermRole, string> = {
  employee: "Employee",
  line_manager: "Direct manager",
  second_level: "Second-level manager",
  functional_manager: "Functional manager",
  project_manager: "Project manager",
  hr_business_partner: "HR business partner",
  hr_admin: "HR administrator",
  calibration_committee: "Calibration committee",
  executive: "Executive",
  system_admin: "System administrator",
};

export type PermCapability =
  | "form_view"
  | "scores_view"
  | "comments_view"
  | "ratings_edit"
  | "reopen"
  | "calibration"
  | "reports_export"
  | "promotion_view";

export const PERM_CAPABILITIES: PermCapability[] = [
  "form_view",
  "scores_view",
  "comments_view",
  "ratings_edit",
  "reopen",
  "calibration",
  "reports_export",
  "promotion_view",
];

export const PERM_CAPABILITY_LABEL: Record<PermCapability, string> = {
  form_view: "View the form",
  scores_view: "View scores",
  comments_view: "View comments",
  ratings_edit: "Modify ratings",
  reopen: "Reopen assessments",
  calibration: "Participate in calibration",
  reports_export: "Export reports",
  promotion_view: "View promotion recommendation",
};

export type PermissionMatrix = Record<PermRole, Record<PermCapability, boolean>>;

const NONE: Record<PermCapability, boolean> = {
  form_view: false,
  scores_view: false,
  comments_view: false,
  ratings_edit: false,
  reopen: false,
  calibration: false,
  reports_export: false,
  promotion_view: false,
};

/** Build a row from the capabilities that should be `true`. */
function row(...granted: PermCapability[]): Record<PermCapability, boolean> {
  const r = { ...NONE };
  for (const c of granted) r[c] = true;
  return r;
}

/**
 * Sensible defaults that mirror today's behaviour: the employee sees only the
 * form and comments (their score is released separately); line/second-level
 * managers and HR see scores and may act; the promotion recommendation stays
 * with senior/HR roles; admins get everything. HR can change any of this in the
 * editor.
 */
export const DEFAULT_PERMISSION_MATRIX: PermissionMatrix = {
  employee: row("form_view", "comments_view"),
  line_manager: row(
    "form_view",
    "scores_view",
    "comments_view",
    "ratings_edit",
    "reports_export",
    "promotion_view",
  ),
  second_level: row(
    "form_view",
    "scores_view",
    "comments_view",
    "ratings_edit",
    "reports_export",
    "promotion_view",
  ),
  functional_manager: row("form_view", "scores_view", "comments_view"),
  project_manager: row("form_view", "comments_view"),
  hr_business_partner: row(
    "form_view",
    "scores_view",
    "comments_view",
    "calibration",
    "reports_export",
    "promotion_view",
  ),
  hr_admin: row(...PERM_CAPABILITIES),
  calibration_committee: row(
    "form_view",
    "scores_view",
    "comments_view",
    "ratings_edit",
    "calibration",
  ),
  executive: row(
    "form_view",
    "scores_view",
    "reports_export",
    "promotion_view",
  ),
  system_admin: row(...PERM_CAPABILITIES),
};

/** Coerce arbitrary JSON into a complete matrix: unknown roles/caps dropped,
 *  missing entries filled from the defaults so the shape is always total. */
export function cleanMatrix(input: unknown): PermissionMatrix {
  const src = (input ?? {}) as Record<string, Record<string, unknown>>;
  const out = {} as PermissionMatrix;
  for (const role of PERM_ROLES) {
    const given = src[role] ?? {};
    const r = {} as Record<PermCapability, boolean>;
    for (const cap of PERM_CAPABILITIES) {
      r[cap] = typeof given[cap] === "boolean"
        ? (given[cap] as boolean)
        : DEFAULT_PERMISSION_MATRIX[role][cap];
    }
    out[role] = r;
  }
  return out;
}

/** Whether any of the held roles grants the capability (OR across roles). */
export function canCapability(
  matrix: PermissionMatrix,
  roles: PermRole[],
  cap: PermCapability,
): boolean {
  return roles.some((r) => matrix[r]?.[cap]);
}

/** How the current user relates to the appraisal being viewed. */
export interface AppraisalRelationship {
  /** The user is the appraisal's subject. */
  isSelf?: boolean;
  /** The user is the employee's direct line manager. */
  isDirectManager?: boolean;
  /** The user is the second-level (manager's manager). */
  isSecondLevel?: boolean;
  /** The user sits on the calibration panel for this person. */
  isCalibrationPanel?: boolean;
}

/** The access flags `resolvePermRoles` needs (a subset of `Access`). */
export interface RoleResolverAccess {
  isHr: boolean;
  isSystemAdmin: boolean;
  isAdmin: boolean;
}

/**
 * Resolve which matrix roles the user holds for one appraisal. Roles the system
 * can't yet derive from data (functional/project manager, HR business partner,
 * executive) simply aren't granted — the matrix still lists them so they can be
 * configured and wired up later.
 */
export function resolvePermRoles(
  access: RoleResolverAccess,
  rel: AppraisalRelationship,
): PermRole[] {
  const roles: PermRole[] = [];
  if (rel.isSelf) roles.push("employee");
  if (rel.isDirectManager) roles.push("line_manager");
  if (rel.isSecondLevel) roles.push("second_level");
  if (rel.isCalibrationPanel) roles.push("calibration_committee");
  if (access.isHr) roles.push("hr_admin");
  if (access.isSystemAdmin || access.isAdmin) roles.push("system_admin");
  return roles;
}
