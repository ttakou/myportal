export type GoalLevel = "corporate" | "department" | "team" | "individual";

export const GOAL_LEVELS: GoalLevel[] = ["corporate", "department", "team", "individual"];

export const GOAL_LEVEL_LABEL: Record<GoalLevel, string> = {
  corporate: "Corporate",
  department: "Department",
  team: "Team",
  individual: "Individual",
};

export type MeasurementType =
  | "percentage"
  | "number"
  | "currency"
  | "date"
  | "yes_no"
  | "milestone"
  | "qualitative"
  | "formula";

export const MEASUREMENT_TYPES: MeasurementType[] = [
  "percentage",
  "number",
  "currency",
  "date",
  "yes_no",
  "milestone",
  "qualitative",
  "formula",
];

export const MEASUREMENT_TYPE_LABEL: Record<MeasurementType, string> = {
  percentage: "Percentage",
  number: "Number",
  currency: "Currency",
  date: "Date",
  yes_no: "Yes / No",
  milestone: "Milestone completion",
  qualitative: "Qualitative",
  formula: "Formula-based",
};

/** A reusable goal in the library (corporate/department/team/individual). */
export interface GoalTemplate {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  level: GoalLevel;
  defaultWeight: number;
  measurementType: MeasurementType;
  unit: string | null;
  strategicObjective: string | null;
  isActive: boolean;
}
