"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import type { ActionResult } from "@/types/actions";
export type { ActionResult };

const rev = () => revalidatePath("/performance/appraisals");

async function uid(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function requireHr(): Promise<ActionResult | null> {
  const a = await getAccess();
  if (a.isHr || a.isAdmin || a.isSystemAdmin) return null;
  return { ok: false, error: "Only HR can manage the appraisal cycle." };
}

type AppraisalRow = {
  id: string;
  tenant_id: string;
  cycle_id: string;
  employee_id: string;
  manager_id: string | null;
  stage: string;
  status: string;
};

async function loadAppraisal(id: string): Promise<AppraisalRow | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisals")
    .select("id, tenant_id, cycle_id, employee_id, manager_id, stage, status")
    .eq("id", id)
    .maybeSingle();
  return (data as AppraisalRow | null) ?? null;
}

async function logEvent(
  a: AppraisalRow,
  action: string,
  comment?: string | null,
): Promise<void> {
  const supabase = createClient();
  await supabase.from("appraisal_events").insert({
    tenant_id: a.tenant_id,
    appraisal_id: a.id,
    actor_id: await uid(),
    stage: a.stage,
    action,
    comment: comment ?? null,
  });
}

// --- HR: cycle setup --------------------------------------------------------

export async function createCycle(input: {
  name: string;
  year: number;
  periodStart: string;
  periodEnd: string;
  goalSettingDeadline?: string;
}): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  if (!input.name.trim()) return { ok: false, error: "Cycle name is required." };
  if (!input.periodStart || !input.periodEnd)
    return { ok: false, error: "Period start and end are required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("appraisal_cycles").insert({
    tenant_id: tenant.id,
    name: input.name.trim(),
    year: Math.floor(input.year) || new Date().getFullYear(),
    period_start: input.periodStart,
    period_end: input.periodEnd,
    goal_setting_deadline: input.goalSettingDeadline || null,
    created_by: await uid(),
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Launch a cycle: activate it and create an appraisal for every active employee. */
export async function launchCycle(cycleId: string): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  const supabase = createClient();
  const { data: cycle } = await supabase
    .from("appraisal_cycles")
    .select("id, tenant_id")
    .eq("id", cycleId)
    .maybeSingle();
  if (!cycle) return { ok: false, error: "Cycle not found." };

  const [{ data: profiles }, { data: existing }] = await Promise.all([
    supabase.from("profiles").select("id, manager_id").eq("is_active", true),
    supabase.from("appraisals").select("employee_id").eq("cycle_id", cycleId),
  ]);
  const have = new Set((existing ?? []).map((e) => e.employee_id as string));
  const rows = (profiles ?? [])
    .filter((p) => !have.has(p.id as string))
    .map((p) => ({
      tenant_id: cycle.tenant_id as string,
      cycle_id: cycleId,
      employee_id: p.id as string,
      manager_id: (p.manager_id as string | null) ?? null,
      stage: "goal_setting",
      status: "not_started",
    }));
  if (rows.length) {
    const { error } = await supabase.from("appraisals").insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  const { error: cErr } = await supabase
    .from("appraisal_cycles")
    .update({ status: "active" })
    .eq("id", cycleId);
  if (cErr) return { ok: false, error: cErr.message };
  rev();
  return { ok: true };
}

export async function closeCycle(cycleId: string): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisal_cycles")
    .update({ status: "closed" })
    .eq("id", cycleId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// --- Employee: goal setting -------------------------------------------------

const EDITABLE = new Set(["not_started", "draft", "returned_for_correction"]);

async function requireEmployeeEditable(id: string): Promise<{ a: AppraisalRow } | ActionResult> {
  const a = await loadAppraisal(id);
  if (!a) return { ok: false, error: "Appraisal not found." };
  const me = await uid();
  const access = await getAccess();
  const isOwnerOrHr = a.employee_id === me || access.isHr || access.isAdmin || access.isSystemAdmin;
  if (!isOwnerOrHr) return { ok: false, error: "Not your appraisal." };
  if (a.stage !== "goal_setting" || !EDITABLE.has(a.status))
    return { ok: false, error: "Goals can't be edited at this stage." };
  return { a };
}

export async function addGoal(input: {
  appraisalId: string;
  title: string;
  description?: string;
  weight?: number;
  deadline?: string;
  successIndicator?: string;
}): Promise<ActionResult> {
  const guard = await requireEmployeeEditable(input.appraisalId);
  if ("ok" in guard) return guard;
  const a = guard.a;
  if (!input.title.trim()) return { ok: false, error: "Goal title is required." };
  const supabase = createClient();
  const { error } = await supabase.from("appraisal_goals").insert({
    tenant_id: a.tenant_id,
    appraisal_id: a.id,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    weight: Math.max(0, Math.min(100, Math.floor(input.weight ?? 0))),
    deadline: input.deadline || null,
    success_indicator: input.successIndicator?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  if (a.status === "not_started")
    await supabase.from("appraisals").update({ status: "draft" }).eq("id", a.id);
  rev();
  return { ok: true };
}

export async function updateGoal(input: {
  goalId: string;
  appraisalId: string;
  title?: string;
  description?: string;
  weight?: number;
  deadline?: string;
  successIndicator?: string;
}): Promise<ActionResult> {
  const guard = await requireEmployeeEditable(input.appraisalId);
  if ("ok" in guard) return guard;
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (input.weight !== undefined) patch.weight = Math.max(0, Math.min(100, Math.floor(input.weight)));
  if (input.deadline !== undefined) patch.deadline = input.deadline || null;
  if (input.successIndicator !== undefined)
    patch.success_indicator = input.successIndicator.trim() || null;
  const { error } = await supabase.from("appraisal_goals").update(patch).eq("id", input.goalId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function deleteGoal(input: { goalId: string; appraisalId: string }): Promise<ActionResult> {
  const guard = await requireEmployeeEditable(input.appraisalId);
  if ("ok" in guard) return guard;
  const supabase = createClient();
  const { error } = await supabase.from("appraisal_goals").delete().eq("id", input.goalId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Employee submits their goal plan for the line manager to review. */
export async function submitGoals(appraisalId: string): Promise<ActionResult> {
  const guard = await requireEmployeeEditable(appraisalId);
  if ("ok" in guard) return guard;
  const a = guard.a;
  const supabase = createClient();
  const { count } = await supabase
    .from("appraisal_goals")
    .select("id", { count: "exact", head: true })
    .eq("appraisal_id", a.id);
  if (!count) return { ok: false, error: "Add at least one goal before submitting." };
  const { error } = await supabase
    .from("appraisals")
    .update({ status: "pending_manager_review" })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent(a, "goals_submitted");
  if (a.manager_id)
    await notifyUsers({
      tenantId: a.tenant_id,
      profileIds: [a.manager_id],
      category: "approval",
      title: "Goals submitted for review",
      body: "A team member submitted their performance goals for your review.",
      url: "/performance/appraisals",
    });
  rev();
  return { ok: true };
}

// --- Manager: goal review ---------------------------------------------------

async function requireManager(id: string): Promise<{ a: AppraisalRow } | ActionResult> {
  const a = await loadAppraisal(id);
  if (!a) return { ok: false, error: "Appraisal not found." };
  const me = await uid();
  const access = await getAccess();
  const isReviewer = a.manager_id === me || access.isHr || access.isAdmin || access.isSystemAdmin;
  if (!isReviewer) return { ok: false, error: "Only the line manager can review this." };
  return { a };
}

export async function returnGoals(input: { appraisalId: string; comment: string }): Promise<ActionResult> {
  const guard = await requireManager(input.appraisalId);
  if ("ok" in guard) return guard;
  const a = guard.a;
  if (a.status !== "pending_manager_review")
    return { ok: false, error: "Goals are not awaiting your review." };
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({ status: "returned_for_correction" })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent(a, "goals_returned", input.comment);
  await notifyUsers({
    tenantId: a.tenant_id,
    profileIds: [a.employee_id],
    category: "approval",
    title: "Goals returned for correction",
    body: input.comment?.trim() || "Your manager asked for changes to your goals.",
    url: "/performance/appraisals",
  });
  rev();
  return { ok: true };
}

/** Manager approves the goal plan: it becomes official and the cycle advances. */
export async function approveGoals(input: { appraisalId: string; comment?: string }): Promise<ActionResult> {
  const guard = await requireManager(input.appraisalId);
  if ("ok" in guard) return guard;
  const a = guard.a;
  if (a.status !== "pending_manager_review")
    return { ok: false, error: "Goals are not awaiting your review." };
  const supabase = createClient();

  const { data: goals } = await supabase
    .from("appraisal_goals")
    .select("id, title, weight, deadline, success_indicator, description")
    .eq("appraisal_id", a.id);

  await supabase.from("appraisal_goals").update({ status: "approved" }).eq("appraisal_id", a.id);
  // Snapshot the approved plan into history (originals are retained).
  await supabase.from("appraisal_goal_history").insert({
    tenant_id: a.tenant_id,
    appraisal_id: a.id,
    changed_by: await uid(),
    change_note: "Goal plan approved",
    snapshot: goals ?? [],
  });
  const { error } = await supabase
    .from("appraisals")
    .update({ stage: "goal_review", status: "not_started" })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent({ ...a, stage: "goal_setting" }, "goals_approved", input.comment);
  await notifyUsers({
    tenantId: a.tenant_id,
    profileIds: [a.employee_id],
    category: "approval",
    title: "Performance goals approved",
    body: "Your manager approved your goals — they're now your official plan for the year.",
    url: "/performance/appraisals",
  });
  rev();
  return { ok: true };
}

// --- Phase 2: mid-year review, self-assessment, manager evaluation ----------

async function requireEmployeeAt(
  id: string,
  stages: string[],
): Promise<{ a: AppraisalRow } | ActionResult> {
  const a = await loadAppraisal(id);
  if (!a) return { ok: false, error: "Appraisal not found." };
  const me = await uid();
  const access = await getAccess();
  const owner = a.employee_id === me || access.isHr || access.isAdmin || access.isSystemAdmin;
  if (!owner) return { ok: false, error: "Not your appraisal." };
  if (!stages.includes(a.stage)) return { ok: false, error: "Not editable at this stage." };
  if (!EDITABLE.has(a.status)) return { ok: false, error: "This stage has already been submitted." };
  return { a };
}

async function requireManagerAt(
  id: string,
  stages: string[],
): Promise<{ a: AppraisalRow } | ActionResult> {
  const guard = await requireManager(id);
  if ("ok" in guard) return guard;
  if (!stages.includes(guard.a.stage)) return { ok: false, error: "Not your stage to action." };
  return guard;
}

/** Employee records progress (mid-year) or self-rating (final) on a goal. */
export async function updateGoalProgress(input: {
  appraisalId: string;
  goalId: string;
  progress?: string;
  atRisk?: boolean;
  employeeComment?: string;
  selfRating?: number;
}): Promise<ActionResult> {
  const guard = await requireEmployeeAt(input.appraisalId, ["goal_review", "self_assessment"]);
  if ("ok" in guard) return guard;
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (input.progress !== undefined) patch.employee_progress = input.progress.trim() || null;
  if (input.atRisk !== undefined) patch.at_risk = input.atRisk;
  if (input.employeeComment !== undefined) patch.employee_comment = input.employeeComment.trim() || null;
  if (input.selfRating !== undefined)
    patch.employee_self_rating = Math.max(0, Math.min(5, input.selfRating));
  const { error } = await supabase.from("appraisal_goals").update(patch).eq("id", input.goalId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Employee submits mid-year progress for the manager. */
export async function submitMidYear(appraisalId: string): Promise<ActionResult> {
  const guard = await requireEmployeeAt(appraisalId, ["goal_review"]);
  if ("ok" in guard) return guard;
  const a = guard.a;
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({ status: "pending_manager_review" })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent(a, "midyear_submitted");
  if (a.manager_id)
    await notifyUsers({
      tenantId: a.tenant_id,
      profileIds: [a.manager_id],
      category: "approval",
      title: "Mid-year progress submitted",
      body: "A team member submitted mid-year progress for review.",
      url: "/performance/appraisals",
    });
  rev();
  return { ok: true };
}

/** Manager completes the mid-year review; advances to the self-assessment stage. */
export async function completeMidYear(input: {
  appraisalId: string;
  comment?: string;
}): Promise<ActionResult> {
  const guard = await requireManagerAt(input.appraisalId, ["goal_review"]);
  if ("ok" in guard) return guard;
  const a = guard.a;
  if (a.status !== "pending_manager_review")
    return { ok: false, error: "Mid-year progress is not awaiting your review." };
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({ stage: "self_assessment", status: "not_started" })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent(a, "midyear_reviewed", input.comment);
  await notifyUsers({
    tenantId: a.tenant_id,
    profileIds: [a.employee_id],
    category: "approval",
    title: "Mid-year review complete",
    body: "Your manager completed the mid-year review. Year-end self-assessment is open when ready.",
    url: "/performance/appraisals",
  });
  rev();
  return { ok: true };
}

/** Employee submits the final self-assessment; advances to the manager's evaluation. */
export async function submitSelfAssessment(input: {
  appraisalId: string;
  summary?: string;
}): Promise<ActionResult> {
  const guard = await requireEmployeeAt(input.appraisalId, ["self_assessment"]);
  if ("ok" in guard) return guard;
  const a = guard.a;
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({ employee_summary: input.summary?.trim() || null, stage: "manager_review", status: "not_started" })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent({ ...a, stage: "self_assessment" }, "self_assessment_submitted");
  if (a.manager_id)
    await notifyUsers({
      tenantId: a.tenant_id,
      profileIds: [a.manager_id],
      category: "approval",
      title: "Self-assessment submitted",
      body: "A team member submitted their year-end self-assessment for evaluation.",
      url: "/performance/appraisals",
    });
  rev();
  return { ok: true };
}

/** Manager rates a goal during the final evaluation. */
export async function setManagerRating(input: {
  appraisalId: string;
  goalId: string;
  rating?: number;
  comment?: string;
}): Promise<ActionResult> {
  const guard = await requireManagerAt(input.appraisalId, ["manager_review"]);
  if ("ok" in guard) return guard;
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (input.rating !== undefined) patch.manager_rating = Math.max(0, Math.min(5, input.rating));
  if (input.comment !== undefined) patch.manager_comment = input.comment.trim() || null;
  const { error } = await supabase.from("appraisal_goals").update(patch).eq("id", input.goalId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Manager submits the final evaluation; computes the weighted overall rating. */
export async function submitManagerEvaluation(input: {
  appraisalId: string;
  summary?: string;
}): Promise<ActionResult> {
  const guard = await requireManagerAt(input.appraisalId, ["manager_review"]);
  if ("ok" in guard) return guard;
  const a = guard.a;
  const supabase = createClient();

  const { data: goals } = await supabase
    .from("appraisal_goals")
    .select("weight, manager_rating")
    .eq("appraisal_id", a.id);
  let wsum = 0;
  let acc = 0;
  let count = 0;
  let plain = 0;
  for (const g of goals ?? []) {
    const r = g.manager_rating as number | null;
    if (r == null) continue;
    const w = (g.weight as number) || 0;
    wsum += w;
    acc += w * r;
    plain += r;
    count += 1;
  }
  if (count === 0) return { ok: false, error: "Rate at least one objective before submitting." };
  const overall = wsum > 0 ? acc / wsum : plain / count;

  const { error } = await supabase
    .from("appraisals")
    .update({
      manager_summary: input.summary?.trim() || null,
      overall_rating: Math.round(overall * 100) / 100,
      stage: "hr_review",
      status: "pending_hr_review",
    })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent({ ...a, stage: "manager_review" }, "manager_evaluation_submitted",
    `Overall ${Math.round(overall * 100) / 100}`);
  await notifyUsers({
    tenantId: a.tenant_id,
    profileIds: [a.employee_id],
    category: "approval",
    title: "Manager evaluation complete",
    body: "Your manager completed your evaluation; it is now with HR for validation.",
    url: "/performance/appraisals",
  });
  rev();
  return { ok: true };
}
