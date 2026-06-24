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

export const PARTICIPANT_STATUS_LABEL: Record<ParticipantStatus, string> = {
  enrolled: "Enrolled",
  attended: "Attended",
  passed: "Passed",
  failed: "Failed",
  no_show: "No-show",
  cancelled: "Cancelled",
};

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  planned: "Planned",
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export interface Provider {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
}

export interface Trainer {
  id: string;
  full_name: string;
  email: string | null;
  expertise: string | null;
  provider_id: string | null;
  is_internal: boolean;
  is_active: boolean;
}

export interface Session {
  id: string;
  course_id: string;
  course_title: string;
  trainer_id: string | null;
  trainer_name: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  status: SessionStatus;
  enrolled: number;
}

export interface Participant {
  id: string;
  profile_id: string;
  full_name: string;
  status: ParticipantStatus;
  score: number | null;
  completed_at: string | null;
  /** Whether a completion/certificate record already exists for this booking. */
  recorded: boolean;
}

export interface Competency {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  description: string | null;
  max_level: number;
  is_active: boolean;
}

/** An employee's level against a competency (catalogue overlaid with their level). */
export interface EmployeeCompetency {
  competency_id: string;
  name: string;
  category: string | null;
  max_level: number;
  current_level: number;
  assessed_on: string | null;
}

