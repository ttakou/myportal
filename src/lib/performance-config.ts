import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PERFORMANCE_CONFIG,
  type PerformanceConfig,
} from "@/types/performance-config";
import type { RatingBand } from "@/types/appraisal";

/** Map a performance_config DB row (snake_case) to the app shape. */
export function configFromRow(r: Record<string, unknown> | null | undefined): PerformanceConfig {
  if (!r) return DEFAULT_PERFORMANCE_CONFIG;
  const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    minGoals: num(r.min_goals, DEFAULT_PERFORMANCE_CONFIG.minGoals),
    maxGoals: num(r.max_goals, DEFAULT_PERFORMANCE_CONFIG.maxGoals),
    goalWeightsTotal100: bool(r.goal_weights_total_100, DEFAULT_PERFORMANCE_CONFIG.goalWeightsTotal100),
    requireSuccessIndicator: bool(r.require_success_indicator, DEFAULT_PERFORMANCE_CONFIG.requireSuccessIndicator),
    requireAlignment: bool(r.require_alignment, DEFAULT_PERFORMANCE_CONFIG.requireAlignment),
    allowEmployeeComments: bool(r.allow_employee_comments, DEFAULT_PERFORMANCE_CONFIG.allowEmployeeComments),
    allowLineManagerComments: bool(r.allow_line_manager_comments, DEFAULT_PERFORMANCE_CONFIG.allowLineManagerComments),
    allowSecondManagerComments: bool(r.allow_second_manager_comments, DEFAULT_PERFORMANCE_CONFIG.allowSecondManagerComments),
    reviewerCount: num(r.reviewer_count, 1) === 2 ? 2 : 1,
    blindReview: bool(r.blind_review, DEFAULT_PERFORMANCE_CONFIG.blindReview),
    weightOkr: num(r.weight_okr, DEFAULT_PERFORMANCE_CONFIG.weightOkr),
    weightCompetency: num(r.weight_competency, DEFAULT_PERFORMANCE_CONFIG.weightCompetency),
    weightDevelopment: num(r.weight_development, DEFAULT_PERFORMANCE_CONFIG.weightDevelopment),
    ratingBands: Array.isArray(r.rating_bands)
      ? (r.rating_bands as RatingBand[])
      : DEFAULT_PERFORMANCE_CONFIG.ratingBands,
    calibrationEnabled: bool(r.calibration_enabled, DEFAULT_PERFORMANCE_CONFIG.calibrationEnabled),
  };
}

/** The tenant's house-standard performance config (defaults if none yet). */
export async function getPerformanceConfig(): Promise<PerformanceConfig> {
  const supabase = createClient();
  const { data } = await supabase
    .from("performance_config")
    .select("*")
    .maybeSingle();
  return configFromRow(data as Record<string, unknown> | null);
}

/**
 * Effective config for a cycle: the tenant template with the cycle's `config`
 * jsonb overlaid (camelCase keys; null/absent = inherit). This is the single
 * resolution point so every screen reads one merged config.
 */
export function mergeCycleOverride(
  base: PerformanceConfig,
  override: Record<string, unknown> | null | undefined,
): PerformanceConfig {
  if (!override || typeof override !== "object") return base;
  const merged: PerformanceConfig = { ...base };
  for (const key of Object.keys(base) as (keyof PerformanceConfig)[]) {
    const v = (override as Record<string, unknown>)[key];
    if (v !== undefined && v !== null) {
      // Trust HR-authored overrides; types line up with the base keys.
      (merged as unknown as Record<string, unknown>)[key] = v;
    }
  }
  return merged;
}
