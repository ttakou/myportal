"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth";
import { requireModule } from "@/lib/permissions-server";
import type { ActionResult } from "@/types/actions";

function rev() {
  revalidatePath("/training");
}

/** The signed-in user's id + tenant_id (RLS needs the right tenant on insert). */
async function me(): Promise<{ id: string; tenant_id: string } | null> {
  const user = await getCachedUser();
  if (!user) return null;
  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();
  if (!data?.tenant_id) return null;
  return { id: user.id, tenant_id: data.tenant_id as string };
}

// --- Employee: training requests --------------------------------------------

export async function submitTrainingRequest(input: {
  courseId?: string | null;
  courseTitle?: string;
  reason?: string;
  preferredPeriod?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("training", "create");
  if (gate) return gate;
  if (!input.courseId && !input.courseTitle?.trim())
    return { ok: false, error: "Pick a course or describe the training." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };

  const supabase = createClient();
  const { error } = await supabase.from("training_requests").insert({
    tenant_id: who.tenant_id,
    profile_id: who.id,
    course_id: input.courseId || null,
    course_title: input.courseId ? null : input.courseTitle?.trim() || null,
    reason: input.reason?.trim() || null,
    preferred_period: input.preferredPeriod?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function cancelTrainingRequest(id: string): Promise<ActionResult> {
  const gate = await requireModule("training", "create");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase
    .from("training_requests")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// --- HR: catalogue ----------------------------------------------------------

export async function upsertCourse(input: {
  id?: string;
  title: string;
  code?: string;
  category?: string;
  delivery?: string;
  isStatutory?: boolean;
  validityMonths?: number | null;
  durationHours?: number | null;
  cost?: number | null;
  description?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  if (!input.title.trim()) return { ok: false, error: "Title is required." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };

  const row = {
    tenant_id: who.tenant_id,
    title: input.title.trim(),
    code: input.code?.trim() || null,
    category: input.category?.trim() || null,
    delivery: (input.delivery as string) || "classroom",
    is_statutory: !!input.isStatutory,
    validity_months: input.validityMonths ?? null,
    duration_hours: input.durationHours ?? null,
    cost: input.cost ?? null,
    description: input.description?.trim() || null,
  };
  const supabase = createClient();
  const { error } = input.id
    ? await supabase.from("training_courses").update(row).eq("id", input.id)
    : await supabase.from("training_courses").insert(row);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setCourseActive(id: string, isActive: boolean): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase
    .from("training_courses")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// --- HR: statutory matrix ---------------------------------------------------

export async function addRequirement(input: {
  courseId: string;
  appliesTo: string;
  appliesValue?: string;
  recurrenceMonths?: number | null;
}): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  if (!input.courseId) return { ok: false, error: "Pick a course." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  const needsValue = input.appliesTo !== "all";
  if (needsValue && !input.appliesValue?.trim())
    return { ok: false, error: "Provide the department / job title / employee type." };

  const supabase = createClient();
  const { error } = await supabase.from("training_requirements").insert({
    tenant_id: who.tenant_id,
    course_id: input.courseId,
    applies_to: input.appliesTo,
    applies_value: needsValue ? input.appliesValue?.trim() || null : null,
    recurrence_months: input.recurrenceMonths ?? null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function deleteRequirement(id: string): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("training_requirements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
