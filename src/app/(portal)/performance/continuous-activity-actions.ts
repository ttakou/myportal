"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContinuousConfig } from "@/lib/continuous";
import type { ActionResult } from "@/types/actions";
import { featureForKind, type ActivityKind } from "@/types/continuous";

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

export async function deleteActivity(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from("continuous_activities").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/performance/continuous");
  return { ok: true };
}
