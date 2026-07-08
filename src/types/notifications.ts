import type { StageRole } from "./workflow";

export type NotificationEvent =
  | "cycle_launch"
  | "goal_submission"
  | "approval_request"
  | "goal_rejection"
  | "upcoming_deadline"
  | "overdue_task"
  | "review_completed"
  | "rating_changed"
  | "calibration_completed"
  | "acknowledgement_required";

export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  "cycle_launch",
  "goal_submission",
  "approval_request",
  "goal_rejection",
  "upcoming_deadline",
  "overdue_task",
  "review_completed",
  "rating_changed",
  "calibration_completed",
  "acknowledgement_required",
];

export const EVENT_LABEL: Record<NotificationEvent, string> = {
  cycle_launch: "Cycle launch",
  goal_submission: "Goal submission",
  approval_request: "Approval request",
  goal_rejection: "Goal rejection",
  upcoming_deadline: "Upcoming deadline",
  overdue_task: "Overdue task",
  review_completed: "Review completed",
  rating_changed: "Rating changed",
  calibration_completed: "Calibration completed",
  acknowledgement_required: "Acknowledgement required",
};

/** Recipient roles, relative to the event's subject. Mirrors workflow roles. */
export type RecipientRole = StageRole;

export const RECIPIENT_ROLES: RecipientRole[] = [
  "employee",
  "line_manager",
  "second_level",
  "hr",
  "calibration",
];

export const RECIPIENT_LABEL: Record<RecipientRole, string> = {
  employee: "Employee",
  line_manager: "Line manager",
  second_level: "Second-level manager",
  hr: "HR",
  calibration: "Calibration committee",
};

export type Channel = "email" | "in_app" | "teams";

export const CHANNELS: Channel[] = ["email", "in_app", "teams"];

export const CHANNEL_LABEL: Record<Channel, string> = {
  email: "Email",
  in_app: "In-app",
  teams: "Microsoft Teams",
};

export type Timing = "immediate" | "before" | "after";
export type Frequency = "once" | "daily" | "until_complete";

export const TIMING_LABEL: Record<Timing, string> = {
  immediate: "Immediately",
  before: "Before",
  after: "After",
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  once: "Once",
  daily: "Daily",
  until_complete: "Until complete",
};

export interface NotificationRule {
  id: string;
  event: NotificationEvent;
  recipients: RecipientRole[];
  customEmails: string[];
  channels: Channel[];
  subjectTemplate: string;
  bodyTemplate: string;
  timing: Timing;
  offsetDays: number;
  frequency: Frequency;
  escalateAfterDays: number | null;
  escalateTo: RecipientRole | null;
  isEnabled: boolean;
}
