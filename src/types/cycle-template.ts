import type { Versioned } from "./versioning";

export type CycleType =
  | "annual"
  | "probation"
  | "midyear"
  | "project"
  | "promotion"
  | "leadership"
  | "pip";

export const CYCLE_TYPES: CycleType[] = [
  "annual",
  "probation",
  "midyear",
  "project",
  "promotion",
  "leadership",
  "pip",
];

export const CYCLE_TYPE_LABEL: Record<CycleType, string> = {
  annual: "Annual appraisal",
  probation: "Probation review",
  midyear: "Mid-year review",
  project: "Project evaluation",
  promotion: "Promotion assessment",
  leadership: "Leadership assessment",
  pip: "Performance improvement plan",
};

export interface CyclePopulation {
  type: "all" | "department" | "grade";
  departments?: string[];
  grades?: string[];
}

export interface CycleVisibility {
  employeeSeesManagerRating: boolean;
  employeeSeesScore: boolean;
  managerSeesSelfBeforeRating: boolean;
}

export interface CycleTemplate extends Versioned {
  id: string;
  name: string;
  description: string | null;
  cycleType: CycleType;
  ratingScaleId: string | null;
  weightOkr: number;
  weightCompetency: number;
  weightDevelopment: number;
  requireSecondLevel: boolean;
  reminderDaysBefore: number;
  population: CyclePopulation;
  visibility: CycleVisibility;
  isActive: boolean;
}

export const DEFAULT_VISIBILITY: CycleVisibility = {
  employeeSeesManagerRating: true,
  employeeSeesScore: true,
  managerSeesSelfBeforeRating: true,
};
