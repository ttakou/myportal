export type CheckInFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "none";

export const CHECK_IN_FREQUENCIES: CheckInFrequency[] = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "none",
];

export const CHECK_IN_FREQUENCY_LABEL: Record<CheckInFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  none: "No fixed cadence",
};

export type FeedbackInitiator = "employee" | "manager" | "peer";

export const FEEDBACK_INITIATORS: FeedbackInitiator[] = ["employee", "manager", "peer"];

export const FEEDBACK_INITIATOR_LABEL: Record<FeedbackInitiator, string> = {
  employee: "Employees",
  manager: "Managers",
  peer: "Peers",
};

export interface CheckInQuestion {
  id: string;
  label: string;
  required: boolean;
}

export interface PulseQuestion {
  id: string;
  label: string;
  scale: number;
}

/** The continuous-performance features HR can switch on/off. */
export type FeatureKey =
  | "one_to_one"
  | "check_in"
  | "goal_update"
  | "feedback"
  | "recognition"
  | "coaching_note"
  | "achievement"
  | "development_action"
  | "journal"
  | "manager_note"
  | "pulse";

export const FEATURE_KEYS: FeatureKey[] = [
  "one_to_one",
  "check_in",
  "goal_update",
  "feedback",
  "recognition",
  "coaching_note",
  "achievement",
  "development_action",
  "journal",
  "manager_note",
  "pulse",
];

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  one_to_one: "One-to-one meetings",
  check_in: "Check-ins",
  goal_update: "Goal updates",
  feedback: "Feedback requests",
  recognition: "Peer recognition",
  coaching_note: "Coaching notes",
  achievement: "Achievement records",
  development_action: "Development actions",
  journal: "Performance journals",
  manager_note: "Manager notes",
  pulse: "Employee pulse",
};

export interface ContinuousConfig {
  checkInFrequency: CheckInFrequency;
  checkInTemplate: CheckInQuestion[];
  pulseQuestions: PulseQuestion[];
  feedbackInitiators: FeedbackInitiator[];
  feedbackAnonymous: boolean;
  feedbackInAppraisal: boolean;
  allowPrivateManagerNotes: boolean;
  enabledFeatures: Record<FeatureKey, boolean>;
}

export const DEFAULT_CONTINUOUS_CONFIG: ContinuousConfig = {
  checkInFrequency: "monthly",
  checkInTemplate: [],
  pulseQuestions: [],
  feedbackInitiators: ["employee", "manager", "peer"],
  feedbackAnonymous: false,
  feedbackInAppraisal: true,
  allowPrivateManagerNotes: true,
  enabledFeatures: FEATURE_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: true }),
    {} as Record<FeatureKey, boolean>,
  ),
};

export type ActivityKind =
  | "one_to_one"
  | "check_in"
  | "goal_update"
  | "feedback_request"
  | "feedback_response"
  | "recognition"
  | "coaching_note"
  | "achievement"
  | "development_action"
  | "journal"
  | "manager_note"
  | "pulse_response";

/** Which on/off feature an activity kind belongs to. */
export function featureForKind(kind: ActivityKind): FeatureKey {
  switch (kind) {
    case "feedback_request":
    case "feedback_response":
      return "feedback";
    case "pulse_response":
      return "pulse";
    default:
      return kind as FeatureKey;
  }
}

export interface ContinuousActivity {
  id: string;
  kind: ActivityKind;
  subjectId: string;
  authorId: string;
  counterpartId: string | null;
  authorName: string | null;
  subjectName: string | null;
  title: string | null;
  body: string | null;
  data: Record<string, unknown>;
  isPrivate: boolean;
  isAnonymous: boolean;
  inAppraisal: boolean;
  status: string | null;
  dueDate: string | null;
  createdAt: string;
}
