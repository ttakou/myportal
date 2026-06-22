"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import type { ActionResult } from "@/types/actions";
import type { PerformanceConfig } from "@/types/performance-config";

const clampInt = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));

/** Save the tenant's performance-management config template. HR / admin only. */
export async function updatePerformanceConfig(input: PerformanceConfig): Promise<ActionResult> {
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return { ok: false, error: "Only HR can change performance settings." };
  }

  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const minGoals = clampInt(input.minGoals, 0, 50);
  const maxGoals = clampInt(input.maxGoals, Math.max(1, minGoals), 50);

  const { error } = await supabase.from("performance_config").upsert(
    {
      tenant_id: tenant.id,
      min_goals: minGoals,
      max_goals: maxGoals,
      min_goal_weight: clampInt(input.minGoalWeight, 0, 100),
      max_goal_weight: clampInt(input.maxGoalWeight, 0, 100),
      goal_weights_total_100: !!input.goalWeightsTotal100,
      require_success_indicator: !!input.requireSuccessIndicator,
      require_alignment: !!input.requireAlignment,
      allow_modify_approved: !!input.allowModifyApproved,
      changes_require_approval: !!input.changesRequireApproval,
      allow_carry_forward: !!input.allowCarryForward,
      allow_cascade: !!input.allowCascade,
      allow_employee_comments: !!input.allowEmployeeComments,
      allow_line_manager_comments: !!input.allowLineManagerComments,
      allow_second_manager_comments: !!input.allowSecondManagerComments,
      reviewer_count: input.reviewerCount === 2 ? 2 : 1,
      blind_review: !!input.blindReview,
      weight_okr: clampInt(input.weightOkr, 0, 100),
      weight_competency: clampInt(input.weightCompetency, 0, 100),
      weight_development: clampInt(input.weightDevelopment, 0, 100),
      rating_bands: input.ratingBands,
      calibration_enabled: !!input.calibrationEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/performance/settings");
  revalidatePath("/performance/appraisals");
  return { ok: true };
}
