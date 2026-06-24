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

// --- HR: providers & trainers -----------------------------------------------

export async function upsertProvider(input: {
  id?: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  if (!input.name.trim()) return { ok: false, error: "Name is required." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  const row = {
    tenant_id: who.tenant_id,
    name: input.name.trim(),
    contact_name: input.contactName?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
  };
  const supabase = createClient();
  const { error } = input.id
    ? await supabase.from("training_providers").update(row).eq("id", input.id)
    : await supabase.from("training_providers").insert(row);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setProviderActive(id: string, isActive: boolean): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("training_providers").update({ is_active: isActive }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function upsertTrainer(input: {
  id?: string;
  fullName: string;
  email?: string;
  expertise?: string;
  providerId?: string | null;
  isInternal?: boolean;
}): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  if (!input.fullName.trim()) return { ok: false, error: "Name is required." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  const row = {
    tenant_id: who.tenant_id,
    full_name: input.fullName.trim(),
    email: input.email?.trim() || null,
    expertise: input.expertise?.trim() || null,
    provider_id: input.providerId || null,
    is_internal: input.isInternal ?? true,
  };
  const supabase = createClient();
  const { error } = input.id
    ? await supabase.from("training_trainers").update(row).eq("id", input.id)
    : await supabase.from("training_trainers").insert(row);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setTrainerActive(id: string, isActive: boolean): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("training_trainers").update({ is_active: isActive }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// --- HR: sessions & participants --------------------------------------------

export async function upsertSession(input: {
  id?: string;
  courseId: string;
  trainerId?: string | null;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  capacity?: number | null;
  status?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  if (!input.courseId) return { ok: false, error: "Pick a course." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  const row = {
    tenant_id: who.tenant_id,
    course_id: input.courseId,
    trainer_id: input.trainerId || null,
    location: input.location?.trim() || null,
    starts_at: input.startsAt || null,
    ends_at: input.endsAt || null,
    capacity: input.capacity ?? null,
    status: (input.status as string) || "planned",
  };
  const supabase = createClient();
  const { error } = input.id
    ? await supabase.from("training_sessions").update(row).eq("id", input.id)
    : await supabase.from("training_sessions").insert(row);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setSessionStatus(id: string, status: string): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("training_sessions").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function enrolParticipant(sessionId: string, profileId: string): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  if (!profileId) return { ok: false, error: "Pick an employee." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  const supabase = createClient();
  const { error } = await supabase
    .from("training_participants")
    .upsert(
      { tenant_id: who.tenant_id, session_id: sessionId, profile_id: profileId },
      { onConflict: "session_id,profile_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setParticipantStatus(id: string, status: string): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "attended" || status === "passed" || status === "failed") patch.attended = true;
  const { error } = await supabase.from("training_participants").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/**
 * Record a completion for a participant — writes a training_record (the
 * certificate), computing expiry from the course's validity_months. This is what
 * feeds the employee's Certificates and Mandatory compliance.
 */
export async function recordCompletion(
  participantId: string,
  opts?: { score?: number | null; certificateNo?: string },
): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  const supabase = createClient();

  const { data: part } = await supabase
    .from("training_participants")
    .select("id, profile_id, session:training_sessions(id, course_id, ends_at, starts_at, course:training_courses(validity_months))")
    .eq("id", participantId)
    .maybeSingle();
  if (!part) return { ok: false, error: "Participant not found." };
  const session = Array.isArray(part.session) ? part.session[0] : (part.session as Record<string, any>);
  if (!session?.course_id) return { ok: false, error: "Session has no course." };
  const course = Array.isArray(session.course) ? session.course[0] : session.course;
  const validity = (course?.validity_months as number | null) ?? null;

  const completedDate = ((session.ends_at as string) || (session.starts_at as string) || new Date().toISOString()).slice(0, 10);
  let expiresOn: string | null = null;
  if (validity && validity > 0) {
    const d = new Date(completedDate + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + validity);
    expiresOn = d.toISOString().slice(0, 10);
  }

  // Avoid duplicate record for the same session+person.
  const { data: existing } = await supabase
    .from("training_records")
    .select("id")
    .eq("session_id", session.id as string)
    .eq("profile_id", part.profile_id as string)
    .maybeSingle();
  if (existing) return { ok: false, error: "Completion already recorded for this person." };

  const { error: recErr } = await supabase.from("training_records").insert({
    tenant_id: who.tenant_id,
    profile_id: part.profile_id as string,
    course_id: session.course_id as string,
    session_id: session.id as string,
    completed_on: completedDate,
    expires_on: expiresOn,
    score: opts?.score ?? null,
    certificate_no: opts?.certificateNo?.trim() || null,
    source: "session",
  });
  if (recErr) return { ok: false, error: recErr.message };

  await supabase
    .from("training_participants")
    .update({ status: "passed", attended: true, completed_at: new Date().toISOString(), score: opts?.score ?? null })
    .eq("id", participantId);

  rev();
  return { ok: true };
}
