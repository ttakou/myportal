export type Dimension =
  | "cycle"
  | "department"
  | "location"
  | "grade"
  | "position"
  | "job_family"
  | "manager"
  | "gender"
  | "contract_type"
  | "employee_category";

export const DIMENSIONS: Dimension[] = [
  "cycle",
  "department",
  "location",
  "grade",
  "position",
  "job_family",
  "manager",
  "gender",
  "contract_type",
  "employee_category",
];

export const DIMENSION_LABEL: Record<Dimension, string> = {
  cycle: "Cycle",
  department: "Department",
  location: "Location",
  grade: "Grade",
  position: "Position",
  job_family: "Job family",
  manager: "Manager",
  gender: "Gender",
  contract_type: "Contract type",
  employee_category: "Employee category",
};

export type Measure =
  | "completion_rate"
  | "average_rating"
  | "goal_achievement"
  | "competency_score"
  | "rating_distribution"
  | "overdue_assessments"
  | "outstanding_performers"
  | "development_plan_completion"
  | "skills_gaps"
  | "promotion_recommendations"
  | "rating_changes_after_calibration";

export const MEASURES: Measure[] = [
  "completion_rate",
  "average_rating",
  "goal_achievement",
  "competency_score",
  "rating_distribution",
  "overdue_assessments",
  "outstanding_performers",
  "development_plan_completion",
  "skills_gaps",
  "promotion_recommendations",
  "rating_changes_after_calibration",
];

export const MEASURE_LABEL: Record<Measure, string> = {
  completion_rate: "Completion rate",
  average_rating: "Average rating",
  goal_achievement: "Goal achievement",
  competency_score: "Competency score",
  rating_distribution: "Rating distribution",
  overdue_assessments: "Overdue assessments",
  outstanding_performers: "Outstanding performers",
  development_plan_completion: "Development-plan completion",
  skills_gaps: "Skills gaps",
  promotion_recommendations: "Promotion recommendations",
  rating_changes_after_calibration: "Rating changes after calibration",
};

export type ChartType = "table" | "bar" | "line" | "pie";

export const CHART_TYPES: ChartType[] = ["table", "bar", "line", "pie"];

export const CHART_TYPE_LABEL: Record<ChartType, string> = {
  table: "Table",
  bar: "Bar chart",
  line: "Line chart",
  pie: "Pie chart",
};

export type AccessRole = "hr" | "manager" | "executive";

export const ACCESS_ROLES: AccessRole[] = ["hr", "manager", "executive"];

export const ACCESS_ROLE_LABEL: Record<AccessRole, string> = {
  hr: "HR",
  manager: "Managers",
  executive: "Executives",
};

export interface ReportFilter {
  dimension: Dimension;
  value: string;
}

export interface ReportSchedule {
  frequency: "weekly" | "monthly" | "quarterly";
  recipients: string[];
}

export interface ReportDefinition {
  id: string;
  name: string;
  description: string | null;
  dimensions: Dimension[];
  measures: Measure[];
  filters: ReportFilter[];
  chartType: ChartType;
  schedule: ReportSchedule | null;
  isWidget: boolean;
  roleAccess: AccessRole[];
}
