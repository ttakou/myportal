export type GroupBy = "department" | "grade" | "job_family" | "business_unit" | "management_level";

export const GROUP_BYS: GroupBy[] = [
  "department",
  "grade",
  "job_family",
  "business_unit",
  "management_level",
];

export const GROUP_BY_LABEL: Record<GroupBy, string> = {
  department: "Department",
  grade: "Grade",
  job_family: "Job family",
  business_unit: "Business unit",
  management_level: "Management level",
};

export type CalibrationMode = "forced" | "guidance";

export const CALIBRATION_MODE_LABEL: Record<CalibrationMode, string> = {
  forced: "Forced distribution",
  guidance: "Guidance only",
};

export type GroupStatus = "open" | "locked" | "approved";

export const GROUP_STATUS_LABEL: Record<GroupStatus, string> = {
  open: "Open",
  locked: "Locked",
  approved: "Approved",
};

export interface DistributionBand {
  label: string;
  percent: number;
}

export interface Confidentiality {
  showPreliminaryToManagers: boolean;
  showAdjustmentReasons: boolean;
  anonymizeInCharts: boolean;
}

export interface CalibrationSettings {
  mode: CalibrationMode;
  distribution: DistributionBand[];
  adjustmentLimit: number;
  requireJustification: boolean;
  approvalRole: string;
  defaultGroupBy: GroupBy;
  confidentiality: Confidentiality;
}

export const DEFAULT_CONFIDENTIALITY: Confidentiality = {
  showPreliminaryToManagers: true,
  showAdjustmentReasons: true,
  anonymizeInCharts: false,
};

export interface CalibrationGroup {
  id: string;
  cycleId: string | null;
  name: string;
  groupBy: GroupBy;
  groupValue: string | null;
  status: GroupStatus;
  mode: CalibrationMode | null;
  distribution: DistributionBand[] | null;
  adjustmentLimit: number | null;
  requireJustification: boolean | null;
  approvalRole: string | null;
}

/** Approval-authority options (reuse the workflow/notification role vocabulary). */
export const APPROVAL_ROLES = ["line_manager", "second_level", "hr", "calibration"] as const;
export const APPROVAL_ROLE_LABEL: Record<(typeof APPROVAL_ROLES)[number], string> = {
  line_manager: "Line manager",
  second_level: "Second-level manager",
  hr: "HR",
  calibration: "Calibration committee",
};
