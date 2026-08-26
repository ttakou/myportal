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

/**
 * The house appraisal process: five phases, in this order.
 *
 * These five were originally created as five separate *cycles*, which gave
 * every employee four or five open appraisals for the same year, counted them
 * once per cycle, and sent them one copy of every notice per cycle. They are
 * phases of one annual cycle, and this is that cycle expressed as stages.
 *
 * The three phases the employee takes part in each run the same four steps:
 *
 *   employee submits → manager reviews and comments → employee signs off →
 *   manager signs off and closes the phase
 *
 * Four stages rather than one because a stage only opens its fields to the role
 * that owns it. One stage per phase would have shut the employee out of their
 * own self-assessment; two would have left them signing nothing, so a manager's
 * comment could stand on the record without the employee ever having seen it.
 * Both sign-offs are recorded against the person who gave them.
 *
 * Day offsets run from the cycle's start date, so the same sequence re-dates
 * itself for any year. Each phase closes on the deadline its old cycle carried,
 * with the preceding steps a week apart ahead of it.
 */
export const HOUSE_PHASES: WorkflowStage[] = [
  // 1 — Goals Setting: closes 31 Mar for a calendar-year cycle.
  preset("goals_setting_submit", "Goals Setting — employee submits", "employee", 68, [
    "goals",
    "key_results",
  ]),
  preset(
    "goals_setting_review",
    "Goals Setting — manager review and comment",
    "line_manager",
    75,
    ["goals", "manager_comment"],
    { return: true },
  ),
  preset("goals_setting_employee_signoff", "Goals Setting — employee sign-off", "employee", 82, [
    "employee_comment",
  ], { approve: true }),
  preset("goals_setting_signoff", "Goals Setting — manager sign-off", "line_manager", 89, [], {
    approve: true,
    return: true,
  }),

  // 2 — Mid Year Review: closes 30 Jun.
  preset("mid_year_submit", "Mid Year Review — employee self-assessment", "employee", 159, [
    "self_rating",
    "employee_comment",
    "key_results",
  ]),
  preset(
    "mid_year_review",
    "Mid Year Review — manager review and comment",
    "line_manager",
    166,
    ["manager_rating", "manager_comment"],
    { return: true },
  ),
  preset("mid_year_employee_signoff", "Mid Year Review — employee sign-off", "employee", 173, [
    "employee_comment",
  ], { approve: true }),
  preset("mid_year_signoff", "Mid Year Review — manager sign-off", "line_manager", 180, [], {
    approve: true,
    return: true,
  }),

  // 3 — Final Review: closes 5 Dec.
  preset("final_review_submit", "Final Review — employee self-assessment", "employee", 317, [
    "self_rating",
    "employee_comment",
  ]),
  preset(
    "final_review_review",
    "Final Review — manager review and comment",
    "line_manager",
    324,
    ["manager_rating", "manager_comment", "overall_rating"],
    { return: true },
  ),
  preset("final_review_employee_signoff", "Final Review — employee sign-off", "employee", 331, [
    "employee_comment",
  ], { approve: true }),
  preset("final_review_signoff", "Final Review — manager sign-off", "line_manager", 338, [], {
    approve: true,
    return: true,
  }),

  // 4 — Annual Calibration: the committee's alone, closes 15 Dec.
  preset(
    "annual_calibration_signoff",
    "Annual Calibration — committee sign-off",
    "calibration",
    348,
    ["overall_rating"],
    { approve: true },
  ),

  // 5 — Final Appraisal: the rating that stands once calibration has moved it,
  // recorded first, then signed by the employee and closed by the manager.
  preset("final_appraisal_rating", "Final Appraisal — final rating recorded", "hr", 356, [
    "overall_rating",
    "manager_comment",
  ]),
  preset("final_appraisal_employee_signoff", "Final Appraisal — employee sign-off", "employee", 361, [
    "employee_comment",
  ], { approve: true }),
  preset("final_appraisal_signoff", "Final Appraisal — manager sign-off", "line_manager", 364, [], {
    approve: true,
  }),
];

/** The five business phases, and which stages make up each one. */
export const HOUSE_PHASE_GROUPS: { phase: string; stageKeys: string[] }[] = [
  {
    phase: "Goals Setting",
    stageKeys: [
      "goals_setting_submit",
      "goals_setting_review",
      "goals_setting_employee_signoff",
      "goals_setting_signoff",
    ],
  },
  {
    phase: "Mid Year Review",
    stageKeys: ["mid_year_submit", "mid_year_review", "mid_year_employee_signoff", "mid_year_signoff"],
  },
  {
    phase: "Final Review",
    stageKeys: [
      "final_review_submit",
      "final_review_review",
      "final_review_employee_signoff",
      "final_review_signoff",
    ],
  },
  { phase: "Annual Calibration", stageKeys: ["annual_calibration_signoff"] },
  {
    phase: "Final Appraisal",
    stageKeys: [
      "final_appraisal_rating",
      "final_appraisal_employee_signoff",
      "final_appraisal_signoff",
    ],
  },
];

/** The phase names in order, for anything that displays the sequence. */
export const HOUSE_PHASE_ORDER = HOUSE_PHASE_GROUPS.map((g) => g.phase);

/** The stage that closes each phase — the last sign-off in it. */
export const PHASE_SIGNOFF_KEYS = HOUSE_PHASE_GROUPS.map(
  (g) => g.stageKeys[g.stageKeys.length - 1],
);
