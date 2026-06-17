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

export interface AppraisalCycle {
  id: string;
  name: string;
  year: number;
  period_start: string;
  period_end: string;
  goal_setting_deadline: string | null;
  status: CycleStatus;
  created_at: string;
}

export interface AppraisalKeyResult {
  id: string;
  title: string;
  target: string | null;
  current_value: string | null;
  unit: string | null;
  progress: number;
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
  stage: AppraisalStage;
  status: AppraisalStatus;
  overall_rating: number | null;
  employee_summary: string | null;
  manager_summary: string | null;
  discussion_date: string | null;
  discussion_notes: string | null;
  acknowledged_at: string | null;
  employee_agreed: boolean | null;
  employee_ack_comment: string | null;
  appeal: AppraisalAppeal | null;
  competencies: CompetencyRating[];
  goals: AppraisalGoal[];
  events: AppraisalEvent[];
}
