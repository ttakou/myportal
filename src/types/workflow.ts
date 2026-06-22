export type StageRole =
  | "employee"
  | "line_manager"
  | "second_level"
  | "hr"
  | "calibration";

export const STAGE_ROLES: StageRole[] = [
  "employee",
  "line_manager",
  "second_level",
  "hr",
  "calibration",
];

export const STAGE_ROLE_LABEL: Record<StageRole, string> = {
  employee: "Employee",
  line_manager: "Line manager",
  second_level: "Second-level manager",
  hr: "HR",
  calibration: "Calibration committee",
};

/** Fields a stage can open for editing. */
export const STAGE_FIELDS = [
  "goals",
  "key_results",
  "self_rating",
  "employee_comment",
  "manager_rating",
  "manager_comment",
  "competencies",
  "development_plan",
  "overall_rating",
] as const;
export type StageField = (typeof STAGE_FIELDS)[number];

export const STAGE_FIELD_LABEL: Record<StageField, string> = {
  goals: "Goals",
  key_results: "Key results",
  self_rating: "Self-rating",
  employee_comment: "Employee comment",
  manager_rating: "Manager rating",
  manager_comment: "Manager comment",
  competencies: "Competencies",
  development_plan: "Development plan",
  overall_rating: "Overall rating",
};

export interface WorkflowStage {
  key: string;
  label: string;
  responsibleRole: StageRole;
  dueOffsetDays: number; // days from cycle start
  mandatory: boolean;
  editableFields: StageField[];
  allowApprove: boolean;
  allowReject: boolean;
  allowReturn: boolean;
  autoProgress: boolean;
  parallelGroup: string | null;
  condition: string | null; // e.g. "grade:management" — interpreted by the engine later
  notify: boolean;
}

/** The standard stage library HR can drop into a workflow (spec §2). */
export const STAGE_PRESETS: WorkflowStage[] = [
  preset("employee_goals", "Employee defines goals", "employee", 0, ["goals", "key_results"]),
  preset("manager_review_goals", "Manager reviews goals", "line_manager", 14, ["goals"], { approve: true, return: true }),
  preset("employee_progress", "Employee updates progress", "employee", 120, ["key_results", "employee_comment"]),
  preset("self_midyear", "Mid-year self-assessment", "employee", 150, ["self_rating", "employee_comment"]),
  preset("manager_midyear", "Manager mid-year assessment", "line_manager", 165, ["manager_rating", "manager_comment"], { approve: true }),
  preset("self_final", "Final self-assessment", "employee", 300, ["self_rating", "employee_comment"]),
  preset("manager_final", "Manager final assessment", "line_manager", 320, ["manager_rating", "manager_comment", "overall_rating"], { approve: true, return: true }),
  preset("second_level", "Second-level validation", "second_level", 330, [], { approve: true, reject: true }),
  preset("hr_calibration", "HR calibration", "calibration", 340, ["overall_rating"], { approve: true }),
  preset("acknowledgement", "Employee acknowledgement", "employee", 350, ["employee_comment"], { approve: true }),
];

function preset(
  key: string,
  label: string,
  role: StageRole,
  dueOffsetDays: number,
  editableFields: StageField[],
  opts: { approve?: boolean; reject?: boolean; return?: boolean } = {},
): WorkflowStage {
  return {
    key,
    label,
    responsibleRole: role,
    dueOffsetDays,
    mandatory: true,
    editableFields,
    allowApprove: !!opts.approve,
    allowReject: !!opts.reject,
    allowReturn: !!opts.return,
    autoProgress: false,
    parallelGroup: null,
    condition: null,
    notify: true,
  };
}
