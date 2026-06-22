import type { RatingBand } from "./appraisal";

/**
 * HR-editable performance-management configuration. One template per tenant
 * (the house standard); a cycle may override selected keys via its `config`.
 */
export interface PerformanceConfig {
  // Goal rules
  minGoals: number;
  maxGoals: number;
  minGoalWeight: number;
  maxGoalWeight: number;
  goalWeightsTotal100: boolean;
  requireSuccessIndicator: boolean;
  requireAlignment: boolean;
  allowModifyApproved: boolean;
  changesRequireApproval: boolean;
  allowCarryForward: boolean;
  allowCascade: boolean;

  // Who may comment (per role)
  allowEmployeeComments: boolean;
  allowLineManagerComments: boolean;
  allowSecondManagerComments: boolean;

  // Reviewers
  reviewerCount: 1 | 2;
  blindReview: boolean;

  // Scoring defaults
  weightOkr: number;
  weightCompetency: number;
  weightDevelopment: number;
  ratingBands: RatingBand[];
  calibrationEnabled: boolean;
}

/** Mirrors the DB column defaults — used when a tenant has no row yet. */
export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  minGoals: 1,
  maxGoals: 8,
  minGoalWeight: 0,
  maxGoalWeight: 100,
  goalWeightsTotal100: true,
  requireSuccessIndicator: false,
  requireAlignment: false,
  allowModifyApproved: false,
  changesRequireApproval: true,
  allowCarryForward: true,
  allowCascade: true,
  allowEmployeeComments: true,
  allowLineManagerComments: true,
  allowSecondManagerComments: false,
  reviewerCount: 1,
  blindReview: false,
  weightOkr: 60,
  weightCompetency: 30,
  weightDevelopment: 10,
  ratingBands: [
    { min: 90, label: "Exceptional" },
    { min: 80, label: "Exceeds Expectations" },
    { min: 70, label: "Meets Expectations" },
    { min: 60, label: "Partially Meets Expectations" },
    { min: 0, label: "Does Not Meet Expectations" },
  ],
  calibrationEnabled: true,
};
