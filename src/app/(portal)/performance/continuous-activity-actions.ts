"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContinuousConfig } from "@/lib/continuous";
import type { ActionResult } from "@/types/actions";
import { featureForKind, type ActivityKind, type FeedbackInitiator } from "@/types/continuous";

const PRIVATE_OK: ActivityKind[] = ["journal", "manager_note", "coaching_note"];

export interface CreateActivityInput {
  kind: ActivityKind;
  subjectId: string;
  counterpartId?: string | null;
  title?: string | null;
  body?: string | null;
  data?: Record<string, unknown>;
  isPrivate?: boolean;
  isAnonymous?: boolean;
  dueDate?: string | null;
  status?: string | null;
}

/** Create a continuous-performance activity, enforcing the tenant config. */
export async function createActivity(input: CreateActivityInput): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!input.subjectId) return { ok: false, error: "Pick who this is about." };
  if (!input.body?.trim() && !input.title?.trim()) return { ok: false, error: "Add some detail." };

  const config = await getContinuousConfig();
  const feature = featureForKind(input.kind);
  if (!config.enabledFeatures[feature]) {
    return { ok: false, error: "That feature is switched off for your organisation." };
  }

  // Privacy is only honoured where it's meaningful and (for manager notes) allowed.
  let isPrivate = !!input.isPrivate && PRIVATE_OK.includes(input.kind);
  if (input.kind === "manager_note" && !config.allowPrivateManagerNotes) isPrivate = false;
  // Anonymity only where the config permits (feedback).
  const isAnonymous = !!input.isAnonymous && feature === "feedback" && config.feedbackAnonymous;

  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { error } = await supabase.from("continuous_activities").insert({
    tenant_id: tenant.id,
    kind: input.kind,
    subject_id: input.subjectId,
    author_id: user.id,
    counterpart_id: input.counterpartId || null,
    title: input.title?.trim() || null,
    body: input.body?.trim() || null,
    data: input.data ?? {},
    is_private: isPrivate,
    is_anonymous: isAnonymous,
    in_appraisal: feature === "feedback" ? config.feedbackInAppraisal : false,
    status: input.status ?? null,
    due_date: input.dueDate || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/performance/continuous");
  return { ok: true };
}

/** Ask a colleague for feedback, enforcing who-may-initiate. */
export async function requestFeedback(input: {
  subjectId: string;
  askId: string;
  prompt?: string | null;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!input.subjectId || !input.askId) return { ok: false, error: "Pick who to ask and who it's about." };
  if (input.askId === user.id) return { ok: false, error: "Pick a colleague to ask." };

  const config = await getContinuousConfig();
  if (!config.enabledFeatures.feedback) {
    return { ok: false, error: "Feedback is switched off for your organisation." };
  }

  // Determine the initiator relationship and check it's permitted.
  let initiator: FeedbackInitiator = "peer";
  if (input.subjectId === user.id) {
    initiator = "employee";
  } else {
    const { data: subj } = await supabase
      .from("profiles")
      .select("manager_id")
      .eq("id", input.subjectId)
      .maybeSingle();
    initiator = (subj as { manager_id?: string } | null)?.manager_id === user.id ? "manager" : "peer";
  }
  if (!config.feedbackInitiators.includes(initiator)) {
    return { ok: false, error: "Your role can't initiate feedback requests." };
  }

  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { error } = await supabase.from("continuous_activities").insert({
    tenant_id: tenant.id,
    kind: "feedback_request",
    subject_id: input.subjectId,
    author_id: user.id,
    counterpart_id: input.askId,
    body: input.prompt?.trim() || null,
    status: "pending",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/continuous");
  return { ok: true };
}

/** Respond to a feedback request (anonymity honoured per config). */
export async function respondToFeedback(input: {
  requestId: string;
  body: string;
  anonymous?: boolean;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!input.body?.trim()) return { ok: false, error: "Write your feedback." };

  const { data: req } = await supabase
    .from("continuous_activities")
    .select("id, tenant_id, subject_id, author_id, counterpart_id")
    .eq("id", input.requestId)
    .eq("kind", "feedback_request")
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  const r = req as Record<string, unknown>;
  if (r.counterpart_id !== user.id) return { ok: false, error: "This request wasn't addressed to you." };

  const config = await getContinuousConfig();
  const isAnonymous = !!input.anonymous && config.feedbackAnonymous;

  const { error } = await supabase.from("continuous_activities").insert({
    tenant_id: r.tenant_id,
    kind: "feedback_response",
    subject_id: r.subject_id,
    author_id: user.id,
    counterpart_id: r.author_id,
    body: input.body.trim(),
    is_anonymous: isAnonymous,
    in_appraisal: config.feedbackInAppraisal,
    data: { requestId: input.requestId },
  });
  if (error) return { ok: false, error: error.message };

  await supabase.from("continuous_activities").update({ status: "answered" }).eq("id", input.requestId);
  revalidatePath("/performance/continuous");
  return { ok: true };
}

export async function deleteActivity(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from("continuous_activities").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/continuous");
  return { ok: true };
}

/** Update an activity's status (e.g. a development action open ↔ done). */
export async function updateActivityStatus(id: string, status: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("continuous_activities")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/continuous");
  return { ok: true };
}
