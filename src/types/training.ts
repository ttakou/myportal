// Training & Competence Management domain types.

export type TrainingDelivery = "classroom" | "online" | "on_job" | "external" | "webinar";

export const DELIVERY_LABEL: Record<TrainingDelivery, string> = {
  classroom: "Classroom",
  online: "Online",
  on_job: "On-the-job",
  external: "External",
  webinar: "Webinar",
};

export type SessionStatus = "planned" | "open" | "in_progress" | "completed" | "cancelled";
export type ParticipantStatus =
  | "enrolled"
  | "attended"
  | "passed"
  | "failed"
  | "no_show"
  | "cancelled";
export type RequestStatus =
  | "requested"
  | "manager_approved"
  | "approved"
  | "rejected"
  | "cancelled";

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  requested: "Requested",
  manager_approved: "Manager approved",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export type PlanStatus =
  | "planned"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "deferred"
  | "cancelled";

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  planned: "Planned",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  deferred: "Deferred",
  cancelled: "Cancelled",
};

export interface TrainingCourse {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  category: string | null;
  delivery: TrainingDelivery;
  provider_id: string | null;
  is_statutory: boolean;
  validity_months: number | null;
  duration_hours: number | null;
  cost: number | null;
  currency: string;
  is_active: boolean;
}

/** A mandatory course for the current user, with their compliance state. */
export interface MandatoryItem {
  course_id: string;
  title: string;
  is_statutory: boolean;
  validity_months: number | null;
  /** Most recent completion + computed expiry, if any. */
  completed_on: string | null;
  expires_on: string | null;
  status: "compliant" | "expiring" | "expired" | "missing";
}

/** A completion record / certificate. */
export interface Certificate {
  id: string;
  course_id: string;
  course_title: string;
  completed_on: string;
  expires_on: string | null;
  certificate_no: string | null;
  certificate_url: string | null;
  status: "valid" | "expiring" | "expired";
}

export interface TrainingRequest {
  id: string;
  course_id: string | null;
  course_title: string | null;
  reason: string | null;
  preferred_period: string | null;
  status: RequestStatus;
  decision_note: string | null;
  created_at: string;
}

export interface PlanItem {
  id: string;
  course_id: string | null;
  course_title: string | null;
  plan_year: number;
  period: string | null;
  status: PlanStatus;
  source: string;
}

/** An upcoming session the user is enrolled in (training calendar). */
export interface UpcomingSession {
  participant_id: string;
  session_id: string;
  course_title: string;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  status: ParticipantStatus;
}
