"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import type { ActionResult } from "@/types/actions";
import {
  CHECK_IN_FREQUENCIES,
  FEATURE_KEYS,
  FEEDBACK_INITIATORS,
  type ContinuousConfig,
} from "@/types/continuous";

export async function saveContinuousConfig(input: ContinuousConfig): Promise<ActionResult> {
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return { ok: false, error: "Only HR can change continuous-performance settings." };
  }

  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const frequency = CHECK_IN_FREQUENCIES.includes(input.checkInFrequency)
    ? input.checkInFrequency
    : "monthly";
  const initiators = (input.feedbackInitiators ?? []).filter((i) => FEEDBACK_INITIATORS.includes(i));
  const enabled = FEATURE_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: input.enabledFeatures?.[k] !== false }),
    {} as Record<string, boolean>,
  );

  const fields = {
    check_in_frequency: frequency,
    check_in_template: (input.checkInTemplate ?? [])
      .filter((q) => q.label?.trim())
      .map((q) => ({ id: q.id, label: q.label.trim(), required: !!q.required })),
    pulse_questions: (input.pulseQuestions ?? [])
      .filter((q) => q.label?.trim())
      .map((q) => ({ id: q.id, label: q.label.trim(), scale: Math.max(2, Math.min(10, q.scale || 5)) })),
    feedback_initiators: initiators,
    feedback_anonymous: !!input.feedbackAnonymous,
    feedback_in_appraisal: !!input.feedbackInAppraisal,
    allow_private_manager_notes: !!input.allowPrivateManagerNotes,
    enabled_features: enabled,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("continuous_config")
    .upsert({ tenant_id: tenant.id, ...fields }, { onConflict: "tenant_id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/performance/settings/continuous");
  return { ok: true };
}
