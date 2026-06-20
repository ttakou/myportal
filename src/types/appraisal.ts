export type CycleStatus = "draft" | "active" | "closed";

export type AppraisalStage =
  | "goal_setting"
  | "goal_review"
  | "self_assessment"
  | "manager_review"
  | "hr_review"
  | "final_discussion"
  | "acknowledgement"
  | "closed";

export type AppraisalStatus =
  | "not_started"
  | "draft"
  | "pending_employee_submission"
  | "pending_manager_review"
  | "returned_for_correction"
  | "pending_hr_review"
  | "pending_second_level"
  | "ready_for_final_discussion"
  | "pending_employee_acknowledgement"
  | "under_appeal"
  | "completed"
  | "closed"
  | "overdue";

export const STAGE_LABEL: Record<AppraisalStage, string> = {
  goal_setting: "Goal setting",
  goal_review: "Mid-year review",
  self_assessment: "Self-assessment",
  manager_review: "Manager review",
  hr_review: "HR validation",
  final_discussion: "Final discussion",
  acknowledgement: "Acknowledgement",
  closed: "Closed",
};

/** True when an appraisal is sitting in the line-manager's court — i.e. the
 *  manager is the one who must act next (review goals, run the mid-year, write
 *  the evaluation, or record the final discussion). Drives the "direct line"
 *  action prompts on the performance dashboard. */
export function managerActionNeeded(stage: AppraisalStage, status: AppraisalStatus): boolean {
  return (
    status === "pending_manager_review" ||
    stage === "manager_review" ||
    (stage === "final_discussion" && status === "ready_for_final_discussion")
  );
}

export const STATUS_LABEL: Record<AppraisalStatus, string> = {
  not_started: "Not started",
  draft: "Draft",
  pending_employee_submission: "Pending employee submission",
  pending_manager_review: "Pending manager review",
  returned_for_correction: "Returned for correction",
  pending_hr_review: "Pending HR review",
  pending_second_level: "Pending second-level approval",
  ready_for_final_discussion: "Ready for final discussion",
  pending_employee_acknowledgement: "Pending employee acknowledgement",
  under_appeal: "Under appeal",
  completed: "Completed",
  closed: "Closed",
  overdue: "Overdue",
};

export interface RatingBand {
  min: number;
  label: string;
}

export interface AppraisalCycle {
  id: string;
  name: string;
  year: number;
  period_start: string;
  period_end: string;
  goal_setting_deadline: string | null;
  status: CycleStatus;
  weight_okr: number;
  weight_competency: number;
  weight_development: number;
  require_second_level: boolean;
  rating_bands: RatingBand[];
  created_at: string;
}

/** Default score → rating bands (spec defaults; thresholds are inclusive minimums). */
export const RATING_BANDS: RatingBand[] = [
  { min: 90, label: "Exceptional" },
  { min: 80, label: "Exceeds Expectations" },
  { min: 70, label: "Meets Expectations" },
  { min: 60, label: "Partially Meets Expectations" },
  { min: 0, label: "Does Not Meet Expectations" },
];

export function ratingLabel(score: number): string {
  return ratingLabelFromBands(score, RATING_BANDS);
}

/** Resolve a score (0–100) to a label using a cycle's configured bands. */
export function ratingLabelFromBands(score: number, bands?: RatingBand[] | null): string {
  const list = (bands && bands.length ? bands : RATING_BANDS)
    .slice()
    .sort((a, b) => b.min - a.min);
  return list.find((b) => score >= b.min)?.label ?? "—";
}

export interface AppraisalKeyResult {
  id: string;
  title: string;
  target: string | null;
  current_value: string | null;
  unit: string | null;
  progress: number;
}

/** A business stakeholder attached to an objective to rate performance on it.
 *  rating/comment are confidential to the manager — they are never populated
 *  for the employee's own view of the appraisal. */
export interface GoalRater {
  id: string;
  rater_id: string;
  rater_name: string | null;
  rating: number | null;
  comment: string | null;
  status: "invited" | "submitted";
}

/** One of the signed-in manager's direct reports, with their appraisal state
 *  for the active cycle. Powers the "My direct line" dashboard section. */
export interface DirectReport {
  profile_id: string;
  name: string;
  job_title: string | null;
  avatar_url: string | null;
  /** The report's appraisal for the active cycle, if one exists yet. */
  appraisal_id: string | null;
  stage: AppraisalStage | null;
  status: AppraisalStatus | null;
  /** The manager must act next on this report's appraisal. */
  needs_action: boolean;
}

/** A person in the tenant, for the stakeholder-reviewer picker. */
export interface Colleague {
  id: string;
  full_name: string | null;
  department: string | null;
}

/** An HR-maintained department (or company-wide) objective employees align to. */
export interface DepartmentObjective {
  id: string;
  department: string | null;
  title: string;
  description: string | null;
  is_active: boolean;
  cycle_id: string | null;
  cycle_name: string | null;
}

/** A review request shown to the stakeholder being asked to rate. */
export interface RaterAssignment {
  id: string;
  appraisal_id: string;
  goal_id: string;
  goal_title: string;
  employee_name: string | null;
  cycle_name: string | null;
  rating: number | null;
  comment: string | null;
  status: "invited" | "submitted";
}

/** One row in the calibration committee roster. */
export interface CalibrationRosterRow {
  id: string;
  employee_name: string | null;
  department: string | null;
  overall_rating: number | null;
  final_score: number | null;
  rating_label: string | null;
  status: AppraisalStatus;
}

/** A logged calibration adjustment (committee-confidential). */
export interface CalibrationAdjustment {
  id: string;
  appraisal_id: string;
  employee_name: string | null;
  previous_score: number | null;
  previous_label: string | null;
  new_score: number | null;
  new_label: string | null;
  reason: string | null;
  adjusted_by_name: string | null;
  created_at: string;
}

export interface AppraisalGoal {
  id: string;
  title: string;
  description: string | null;
  weight: number;
  deadline: string | null;
  success_indicator: string | null;
  alignment: string | null;
  evidence_required: string | null;
  kind: "objective" | "development";
  employee_progress: string | null;
  employee_self_rating: number | null;
  employee_comment: string | null;
  manager_rating: number | null;
  manager_comment: string | null;
  at_risk: boolean;
  status: "draft" | "approved";
  key_results: AppraisalKeyResult[];
  raters: GoalRater[];
}

export interface AppraisalEvent {
  id: string;
  actor_name: string | null;
  stage: string | null;
  action: string;
  comment: string | null;
  created_at: string;
}

export interface AppraisalCompetency {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface CompetencyRating {
  competency_id: string;
  name: string;
  employee_rating: number | null;
  manager_rating: number | null;
  manager_comment: string | null;
}

export interface AppraisalDevelopmentItem {
  id: string;
  area: string;
  action: string | null;
  target_date: string | null;
  status: "planned" | "in_progress" | "done";
}

export interface AppraisalAppeal {
  id: string;
  reason: string | null;
  status: "open" | "resolved";
  decision: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface Appraisal {
  id: string;
  cycle_id: string;
  cycle_name: string | null;
  employee_id: string;
  employee_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  second_level_id: string | null;
  second_level_name: string | null;
  stage: AppraisalStage;
  status: AppraisalStatus;
  overall_rating: number | null;
  final_score: number | null;
  rating_label: string | null;
  employee_summary: string | null;
  manager_summary: string | null;
  discussion_date: string | null;
  discussion_notes: string | null;
  acknowledged_at: string | null;
  employee_agreed: boolean | null;
  employee_ack_comment: string | null;
  appeal: AppraisalAppeal | null;
  competencies: CompetencyRating[];
  development_plan: AppraisalDevelopmentItem[];
  goals: AppraisalGoal[];
  events: AppraisalEvent[];
  /** Set when the goals shown belong to another cycle of the same year (the
   * year's Annual cycle). In a "gate" cycle (mid-year, final, calibration) the
   * year's goals are surfaced read-only; they're edited/rated in that cycle. */
  goalsReadOnly?: boolean;
  goalsSourceName?: string | null;
}
