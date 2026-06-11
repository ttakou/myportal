export type IssueType =
  | "none"
  | "hygiene"
  | "late_service"
  | "wrong_meal"
  | "allergy"
  | "suggestion";

export type FeedbackStatus = "open" | "resolved";

export const ISSUE_LABEL: Record<IssueType, string> = {
  none: "General rating",
  hygiene: "Hygiene issue",
  late_service: "Late service",
  wrong_meal: "Wrong meal",
  allergy: "Allergy concern",
  suggestion: "Menu suggestion",
};

/** Issue types that represent incidents to be tracked/resolved. */
export const INCIDENT_TYPES: IssueType[] = [
  "hygiene",
  "late_service",
  "wrong_meal",
  "allergy",
];

export interface Feedback {
  id: string;
  person_name: string | null;
  service_date: string;
  food_quality: number | null;
  quantity_rating: number | null;
  issue_type: IssueType;
  comment: string | null;
  status: FeedbackStatus;
  created_at: string;
}
