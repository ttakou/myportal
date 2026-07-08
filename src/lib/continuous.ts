import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_CONTINUOUS_CONFIG,
  FEATURE_KEYS,
  type ActivityKind,
  type CheckInFrequency,
  type CheckInQuestion,
  type ContinuousActivity,
  type ContinuousConfig,
  type FeatureKey,
  type FeedbackInitiator,
  type PulseQuestion,
} from "@/types/continuous";

export interface DirectoryEntry {
  id: string;
  name: string;
}

function nameFrom(embed: unknown): string | null {
  const o = Array.isArray(embed) ? embed[0] : embed;
  return (o as { full_name?: string } | null)?.full_name ?? null;
}

function activityFromRow(r: Record<string, unknown>): ContinuousActivity {
  const anonymous = !!r.is_anonymous;
  return {
    id: String(r.id),
    kind: r.kind as ActivityKind,
    subjectId: String(r.subject_id),
    authorId: String(r.author_id),
    counterpartId: (r.counterpart_id as string | null) ?? null,
    authorName: anonymous ? null : nameFrom(r.author),
    subjectName: nameFrom(r.subject),
    title: (r.title as string | null) ?? null,
    body: (r.body as string | null) ?? null,
    data: (r.data as Record<string, unknown>) ?? {},
    isPrivate: !!r.is_private,
    isAnonymous: anonymous,
    inAppraisal: !!r.in_appraisal,
    status: (r.status as string | null) ?? null,
    dueDate: (r.due_date as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
  };
}

/** The current user's profile id. */
export async function getMyProfileId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Tenant directory for picking colleagues (RLS-scoped). */
export async function getDirectory(): Promise<DirectoryEntry[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .order("full_name", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: String(p.id),
    name: (p.full_name as string) ?? "Unknown",
  }));
}

/** Activities of the given kinds visible to the current user (RLS-scoped). */
export async function getActivitiesByKind(
  kinds: ActivityKind[],
  opts: { subjectId?: string; limit?: number } = {},
): Promise<ContinuousActivity[]> {
  const supabase = createClient();
  let q = supabase
    .from("continuous_activities")
    .select("*, author:profiles!author_id(full_name), subject:profiles!subject_id(full_name)")
    .in("kind", kinds)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.subjectId) q = q.eq("subject_id", opts.subjectId);
  const { data } = await q;
  return ((data ?? []) as Record<string, unknown>[]).map(activityFromRow);
}

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
