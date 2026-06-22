import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_CONTINUOUS_CONFIG,
  FEATURE_KEYS,
  type CheckInFrequency,
  type CheckInQuestion,
  type ContinuousConfig,
  type FeatureKey,
  type FeedbackInitiator,
  type PulseQuestion,
} from "@/types/continuous";

function configFromRow(r: Record<string, unknown> | null): ContinuousConfig {
  if (!r) return DEFAULT_CONTINUOUS_CONFIG;
  const enabled = (r.enabled_features as Record<string, unknown>) ?? {};
  return {
    checkInFrequency: (r.check_in_frequency as CheckInFrequency) ?? "monthly",
    checkInTemplate: Array.isArray(r.check_in_template) ? (r.check_in_template as CheckInQuestion[]) : [],
    pulseQuestions: Array.isArray(r.pulse_questions) ? (r.pulse_questions as PulseQuestion[]) : [],
    feedbackInitiators: Array.isArray(r.feedback_initiators)
      ? (r.feedback_initiators as FeedbackInitiator[])
      : DEFAULT_CONTINUOUS_CONFIG.feedbackInitiators,
    feedbackAnonymous: !!r.feedback_anonymous,
    feedbackInAppraisal: r.feedback_in_appraisal !== false,
    allowPrivateManagerNotes: r.allow_private_manager_notes !== false,
    enabledFeatures: FEATURE_KEYS.reduce(
      (acc, k) => ({ ...acc, [k]: enabled[k] !== false }),
      {} as Record<FeatureKey, boolean>,
    ),
  };
}

/** The tenant's continuous-performance configuration (falls back to defaults). */
export async function getContinuousConfig(): Promise<ContinuousConfig> {
  const supabase = createClient();
  const { data } = await supabase.from("continuous_config").select("*").limit(1).maybeSingle();
  return configFromRow(data as Record<string, unknown> | null);
}
