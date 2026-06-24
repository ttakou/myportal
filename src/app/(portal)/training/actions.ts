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

/** Confirm a referenced row belongs to the caller's tenant — child rows carry
 *  the tenant_id, but their FK targets (profiles/sessions/courses) don't, so we
 *  validate them here to keep tenant isolation on inserts. */
async function inTenant(table: string, id: string, tenantId: string): Promise<boolean> {
  if (!id) return false;
  const supabase = createClient();
  const { data } = await supabase.from(table).select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  return !!data;
}

// --- Employee: training requests --------------------------------------------

const REQUEST_ORIGINS = [
  "employee_request","manager_request","performance_appraisal","competency_gap",
  "career_development","promotion_preparation","succession_plan","technology_change",
  "job_change","personal_development_plan","project_requirement",
];

export async function submitTrainingRequest(input: {
  courseId?: string | null;
  courseTitle?: string;
  reason?: string;
  preferredPeriod?: string;
  origin?: string;
  /** When set, links the request to the IDP development-plan row it satisfies. */
  developmentPlanId?: string | null;
}): Promise<ActionResult> {
  const gate = await requireModule("training", "create");
  if (gate) return gate;
  if (!input.courseId && !input.courseTitle?.trim())
    return { ok: false, error: "Pick a course or describe the training." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  const origin = input.origin && REQUEST_ORIGINS.includes(input.origin) ? input.origin : null;

  // An IDP-linked request must reference one of the caller's own development-plan
  // rows; default its origin to the personal development plan.
  let developmentPlanId: string | null = null;
  if (input.developmentPlanId) {
    const supabase = createClient();
    const { data: plan } = await supabase
      .from("appraisal_development_plans")
      .select("id, appraisal:appraisals!inner(employee_id)")
      .eq("id", input.developmentPlanId)
      .maybeSingle();
    const appraisal = plan && (Array.isArray((plan as any).appraisal) ? (plan as any).appraisal[0] : (plan as any).appraisal);
    if (!plan || appraisal?.employee_id !== who.id)
      return { ok: false, error: "Development-plan item not found." };
    developmentPlanId = input.developmentPlanId;
  }

  const supabase = createClient();
  const { error } = await supabase.from("training_requests").insert({
    tenant_id: who.tenant_id,
    profile_id: who.id,
    course_id: input.courseId || null,
    course_title: input.courseId ? null : input.courseTitle?.trim() || null,
    reason: input.reason?.trim() || null,
    preferred_period: input.preferredPeriod?.trim() || null,
    origin: developmentPlanId ? origin ?? "personal_development_plan" : origin,
    development_plan_id: developmentPlanId,
  });
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "A training request for this development item already exists." };
    return { ok: false, error: error.message };
  }
  rev();
  return { ok: true };
}

// --- Employee self-service ---------------------------------------------------

/** Self-enrol the signed-in employee into an OPEN session. */
export async function selfEnrolSession(sessionId: string): Promise<ActionResult> {
  const gate = await requireModule("training", "create");
  if (gate) return gate;
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  const supabase = createClient();
  const { data: sess } = await supabase
    .from("training_sessions")
    .select("id, status, capacity, training_participants(count)")
    .eq("id", sessionId)
    .eq("tenant_id", who.tenant_id)
    .maybeSingle();
  if (!sess) return { ok: false, error: "Session not found." };
  if (sess.status !== "open") return { ok: false, error: "This session is not open for enrolment." };
  const enrolled = (sess as any).training_participants?.[0]?.count ?? 0;
  if (sess.capacity != null && enrolled >= sess.capacity) return { ok: false, error: "This session is full." };

  const { error } = await supabase
    .from("training_participants")
    .upsert(
      { tenant_id: who.tenant_id, session_id: sessionId, profile_id: who.id, status: "enrolled" },
      { onConflict: "session_id,profile_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Withdraw the signed-in employee from a session they enrolled in. */
export async function withdrawEnrolment(participantId: string): Promise<ActionResult> {
  const gate = await requireModule("training", "create");
  if (gate) return gate;
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_participants")
    .update({ status: "cancelled" })
    .eq("id", participantId)
    .eq("profile_id", who.id)
    .in("status", ["enrolled", "attended"])
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "You can no longer withdraw from this session." };
  rev();
  return { ok: true };
}

/**
 * Self-upload an external certificate. It is recorded UNVERIFIED (source 'self')
 * so it shows in the employee's history but does not count toward statutory
 * compliance until a Training Admin verifies it.
 */
export async function uploadCertificate(input: {
  courseId?: string | null;
  courseTitle?: string;
  completedOn: string;
  expiresOn?: string | null;
  certificateNo?: string;
  certificateUrl?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("training", "create");
  if (gate) return gate;
  if (!input.completedOn) return { ok: false, error: "Completion date is required." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };

  // Resolve the course: pick from catalogue, or fall back to a free-text title we
  // store on a placeholder? training_records requires a course_id, so a catalogue
  // course must be chosen.
  if (!input.courseId) return { ok: false, error: "Pick the course this certificate is for." };
  if (!(await inTenant("training_courses", input.courseId, who.tenant_id)))
    return { ok: false, error: "Course not found." };

  const supabase = createClient();
  const { error } = await supabase.from("training_records").insert({
    tenant_id: who.tenant_id,
    profile_id: who.id,
    course_id: input.courseId,
    completed_on: input.completedOn,
    expires_on: input.expiresOn || null,
    certificate_no: input.certificateNo?.trim() || null,
    certificate_url: input.certificateUrl?.trim() || null,
    source: "self",
    verified: false,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Record the employee's own self-assessment for a competency (kept separate). */
export async function selfAssessCompetency(competencyId: string, level: number): Promise<ActionResult> {
  const gate = await requireModule("training", "create");
  if (gate) return gate;
  if (!competencyId) return { ok: false, error: "Pick a competency." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  if (!(await inTenant("training_competencies", competencyId, who.tenant_id)))
    return { ok: false, error: "Competency not found." };
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  // Update an existing row's self_* only, else insert a fresh row.
  const { data: existing } = await supabase
    .from("training_employee_competencies")
    .select("id")
    .eq("profile_id", who.id)
    .eq("competency_id", competencyId)
    .maybeSingle();
  const { error } = existing
    ? await supabase
        .from("training_employee_competencies")
        .update({ self_level: level, self_assessed_on: today })
        .eq("id", existing.id)
    : await supabase.from("training_employee_competencies").insert({
        tenant_id: who.tenant_id,
        profile_id: who.id,
        competency_id: competencyId,
        current_level: 0,
        self_level: level,
        self_assessed_on: today,
      });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Submit the employee's own post-training evaluation for a session they took. */
export async function submitSelfEvaluation(input: {
  sessionId: string;
  kind?: string;
  score?: number | null;
  comments?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("training", "create");
  if (gate) return gate;
  if (!input.sessionId) return { ok: false, error: "Pick a session." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  const supabase = createClient();
  // Must have actually taken part in the session.
  const { data: part } = await supabase
    .from("training_participants")
    .select("id")
    .eq("session_id", input.sessionId)
    .eq("profile_id", who.id)
    .maybeSingle();
  if (!part) return { ok: false, error: "You weren't a participant in this session." };
  const { error } = await supabase.from("training_evaluations").insert({
    tenant_id: who.tenant_id,
    session_id: input.sessionId,
    participant_id: part.id,
    profile_id: who.id,
    kind: input.kind || "reaction",
    score: input.score ?? null,
    comments: input.comments?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function cancelTrainingRequest(id: string): Promise<ActionResult> {
  const gate = await requireModule("training", "create");
  if (gate) return gate;
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  const supabase = createClient();
  // Only the owner may cancel, and only while still pending.
  const { data, error } = await supabase
    .from("training_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("profile_id", who.id)
    .eq("status", "requested")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "This request can no longer be cancelled." };
  rev();
  return { ok: true };
}

// --- Manager: decide a report's training request ----------------------------

export async function decideTrainingRequest(
  id: string,
  decision: "approve" | "reject",
  note?: string,
): Promise<ActionResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const supabase = createClient();

  const { data: req } = await supabase.from("training_requests").select("profile_id").eq("id", id).maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  const { data: prof } = await supabase.from("profiles").select("manager_id").eq("id", req.profile_id).maybeSingle();
  const isManager = prof?.manager_id === user.id;

  // Authorize: the requester's line manager, or a Training Admin (training:manage).
  // We require `manage` (not `approve`) for non-managers because the RLS update
  // policies on training_requests only admit the line manager or a manage holder
  // — gating on `approve` would pass here yet be silently blocked by RLS.
  if (!isManager) {
    const gate = await requireModule("training", "manage");
    if (gate) return gate;
  }

  const patch: Record<string, unknown> = {
    status: decision === "approve" ? "approved" : "rejected",
    decided_by: user.id,
    decided_at: new Date().toISOString(),
    decision_note: note?.trim() || null,
  };
  // Record the line manager only when the actual line manager approves (the
  // approver may be a Training Admin who isn't this person's manager).
  if (isManager && decision === "approve") patch.manager_id = user.id;

  const { data, error } = await supabase.from("training_requests").update(patch).eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "You can't decide this request." };
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

// --- HR: annual plan --------------------------------------------------------

export async function addPlanItem(input: {
  profileId: string;
  courseId?: string | null;
  courseTitle?: string;
  planYear: number;
  period?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  if (!input.profileId) return { ok: false, error: "Pick an employee." };
  if (!input.courseId && !input.courseTitle?.trim()) return { ok: false, error: "Pick a course." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  if (!(await inTenant("profiles", input.profileId, who.tenant_id))) return { ok: false, error: "Employee not found." };
  const supabase = createClient();
  const { error } = await supabase.from("training_plan_items").insert({
    tenant_id: who.tenant_id,
    profile_id: input.profileId,
    course_id: input.courseId || null,
    course_title: input.courseId ? null : input.courseTitle?.trim() || null,
    plan_year: input.planYear,
    period: input.period?.trim() || null,
    source: "manager",
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setPlanItemStatus(id: string, status: string): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("training_plan_items").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function deletePlanItem(id: string): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("training_plan_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// --- HR: budgets ------------------------------------------------------------

export async function upsertBudget(input: {
  id?: string;
  budgetYear: number;
  department?: string;
  amount: number;
}): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  if (!input.budgetYear) return { ok: false, error: "Year is required." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  const row = {
    tenant_id: who.tenant_id,
    budget_year: input.budgetYear,
    department: input.department?.trim() || null,
    amount: input.amount || 0,
  };
  const supabase = createClient();
  const { error } = input.id
    ? await supabase.from("training_budgets").update(row).eq("id", input.id)
    : await supabase.from("training_budgets").upsert(row, { onConflict: "tenant_id,budget_year,department" });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function deleteBudget(id: string): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("training_budgets").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// --- HR: evaluations --------------------------------------------------------

export async function addEvaluation(input: {
  sessionId: string;
  profileId: string;
  kind: string;
  score?: number | null;
  comments?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  if (!input.sessionId || !input.profileId) return { ok: false, error: "Pick a participant." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  if (!(await inTenant("training_sessions", input.sessionId, who.tenant_id))) return { ok: false, error: "Session not found." };
  if (!(await inTenant("profiles", input.profileId, who.tenant_id))) return { ok: false, error: "Employee not found." };
  const supabase = createClient();
  const { error } = await supabase.from("training_evaluations").insert({
    tenant_id: who.tenant_id,
    session_id: input.sessionId,
    profile_id: input.profileId,
    kind: input.kind || "reaction",
    score: input.score ?? null,
    comments: input.comments?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function deleteEvaluation(id: string): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("training_evaluations").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// --- Competence -------------------------------------------------------------

export async function upsertCompetency(input: {
  id?: string;
  name: string;
  code?: string;
  category?: string;
  maxLevel?: number;
  description?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  if (!input.name.trim()) return { ok: false, error: "Name is required." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  const row = {
    tenant_id: who.tenant_id,
    name: input.name.trim(),
    code: input.code?.trim() || null,
    category: input.category?.trim() || null,
    max_level: input.maxLevel && input.maxLevel > 0 ? input.maxLevel : 5,
    description: input.description?.trim() || null,
  };
  const supabase = createClient();
  const { error } = input.id
    ? await supabase.from("training_competencies").update(row).eq("id", input.id)
    : await supabase.from("training_competencies").insert(row);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setCompetencyActive(id: string, isActive: boolean): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("training_competencies").update({ is_active: isActive }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function linkCourseCompetency(input: {
  competencyId: string;
  courseId: string;
  targetLevel: number;
}): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  if (!input.competencyId || !input.courseId) return { ok: false, error: "Pick a competency and a course." };
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  const supabase = createClient();
  const { error } = await supabase.from("training_course_competencies").upsert(
    {
      tenant_id: who.tenant_id,
      competency_id: input.competencyId,
      course_id: input.courseId,
      target_level: input.targetLevel || 1,
    },
    { onConflict: "course_id,competency_id" },
  );
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function unlinkCourseCompetency(id: string): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("training_course_competencies").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Set (assess) an employee's level against a competency. */
export async function setEmployeeCompetency(
  profileId: string,
  competencyId: string,
  level: number,
): Promise<ActionResult> {
  const gate = await requireModule("training", "manage");
  if (gate) return gate;
  const who = await me();
  if (!who) return { ok: false, error: "No tenant in scope." };
  if (!(await inTenant("profiles", profileId, who.tenant_id))) return { ok: false, error: "Employee not found." };
  const supabase = createClient();
  const { error } = await supabase.from("training_employee_competencies").upsert(
    {
      tenant_id: who.tenant_id,
      profile_id: profileId,
      competency_id: competencyId,
      current_level: level,
      assessed_on: new Date().toISOString().slice(0, 10),
      assessed_by: who.id,
    },
    { onConflict: "profile_id,competency_id" },
  );
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
  if (!(await inTenant("training_sessions", sessionId, who.tenant_id))) return { ok: false, error: "Session not found." };
  if (!(await inTenant("profiles", profileId, who.tenant_id))) return { ok: false, error: "Employee not found." };
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

  // Auto-raise any competencies this course develops to their target level.
  const { data: links } = await supabase
    .from("training_course_competencies")
    .select("competency_id, target_level")
    .eq("course_id", session.course_id as string);
  if (links && links.length) {
    const compIds = links.map((l) => l.competency_id as string);
    const { data: existing } = await supabase
      .from("training_employee_competencies")
      .select("competency_id, current_level")
      .eq("profile_id", part.profile_id as string)
      .in("competency_id", compIds);
    const cur = new Map(((existing ?? []) as Record<string, any>[]).map((e) => [e.competency_id as string, (e.current_level as number) ?? 0]));
    const rows = links.map((l) => ({
      tenant_id: who.tenant_id,
      profile_id: part.profile_id as string,
      competency_id: l.competency_id as string,
      current_level: Math.max(cur.get(l.competency_id as string) ?? 0, (l.target_level as number) ?? 1),
      assessed_on: completedDate,
      assessed_by: who.id,
    }));
    await supabase.from("training_employee_competencies").upsert(rows, { onConflict: "profile_id,competency_id" });
  }

  rev();
  return { ok: true };
}
