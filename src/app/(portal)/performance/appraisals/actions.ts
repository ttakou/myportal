"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import { runAppraisalReminders } from "@/lib/appraisal-reminders";
import { dispatchEvent } from "@/lib/notify-dispatch";
import { getPerformanceConfig } from "@/lib/performance-config";
import { ratingLabelFromBands, type RatingBand } from "@/types/appraisal";
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
  second_level_id: string | null;
  stage: string;
  status: string;
};

async function loadAppraisal(id: string): Promise<AppraisalRow | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisals")
    .select("id, tenant_id, cycle_id, employee_id, manager_id, second_level_id, stage, status")
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

function clampWeight(v: number | undefined, fallback: number): number {
  if (v === undefined || !Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, Math.floor(v)));
}

/** Clean + order rating bands (highest threshold first). Returns undefined when
 *  nothing usable is supplied, so the DB default applies. */
function normalizeBands(bands?: RatingBand[]): RatingBand[] | undefined {
  if (!bands || !bands.length) return undefined;
  const clean = bands
    .map((b) => ({
      min: Math.max(0, Math.min(100, Math.floor(Number(b.min) || 0))),
      label: (b.label ?? "").trim(),
    }))
    .filter((b) => b.label);
  if (!clean.length) return undefined;
  clean.sort((a, b) => b.min - a.min);
  return clean;
}

// --- HR: cycle setup --------------------------------------------------------

export async function createCycle(input: {
  name: string;
  year: number;
  periodStart: string;
  periodEnd: string;
  goalSettingDeadline?: string;
  weightOkr?: number;
  weightCompetency?: number;
  weightDevelopment?: number;
  requireSecondLevel?: boolean;
  ratingBands?: RatingBand[];
}): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  if (!input.name.trim()) return { ok: false, error: "Cycle name is required." };
  if (!input.periodStart || !input.periodEnd)
    return { ok: false, error: "Period start and end are required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const bands = normalizeBands(input.ratingBands);
  const { error } = await supabase.from("appraisal_cycles").insert({
    tenant_id: tenant.id,
    name: input.name.trim(),
    year: Math.floor(input.year) || new Date().getFullYear(),
    period_start: input.periodStart,
    period_end: input.periodEnd,
    goal_setting_deadline: input.goalSettingDeadline || null,
    weight_okr: clampWeight(input.weightOkr, 70),
    weight_competency: clampWeight(input.weightCompetency, 20),
    weight_development: clampWeight(input.weightDevelopment, 10),
    require_second_level: Boolean(input.requireSecondLevel),
    ...(bands ? { rating_bands: bands } : {}),
    created_by: await uid(),
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** HR edits a cycle's score → rating bands. */
export async function updateCycleBands(input: {
  cycleId: string;
  bands: RatingBand[];
}): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  const bands = normalizeBands(input.bands);
  if (!bands) return { ok: false, error: "Add at least one band with a label." };
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisal_cycles")
    .update({ rating_bands: bands })
    .eq("id", input.cycleId);
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
    .select("id, tenant_id, name")
    .eq("id", cycleId)
    .maybeSingle();
  if (!cycle) return { ok: false, error: "Cycle not found." };

  const [{ data: profiles }, { data: existing }] = await Promise.all([
    // Appraise only staff who can access the Performance module — employees/
    // expats with a performance-view access role (or unrestricted). Contractors,
    // guests and anyone restricted away from Performance are excluded.
    supabase.rpc("appraisable_profiles"),
    supabase.from("appraisals").select("employee_id").eq("cycle_id", cycleId),
  ]);
  const have = new Set((existing ?? []).map((e) => e.employee_id as string));
  const roster = (profiles ?? []) as { id: string; manager_id: string | null }[];
  const rows = roster
    .filter((p) => !have.has(p.id))
    .map((p) => ({
      tenant_id: cycle.tenant_id as string,
      cycle_id: cycleId,
      employee_id: p.id,
      manager_id: p.manager_id ?? null,
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

  // Configurable notifications: announce the launch per the tenant's rules.
  await dispatchEvent("cycle_launch", {
    tenantId: cycle.tenant_id as string,
    employeeIds: roster.map((p) => p.id),
    managerIds: roster.map((p) => p.manager_id).filter((x): x is string => Boolean(x)),
    placeholders: { cycle: String(cycle.name ?? "appraisal cycle") },
    url: "/performance/appraisals",
  });

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

/**
 * Delete a stray cycle. Guarded so only an un-launched **draft** cycle with **no
 * appraisals** can be removed — launched/closed cycles (which carry employee
 * records) must be closed, never deleted.
 */
export async function deleteCycle(cycleId: string): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  const supabase = createClient();

  const { data: cycle } = await supabase
    .from("appraisal_cycles")
    .select("id, status")
    .eq("id", cycleId)
    .maybeSingle();
  if (!cycle) return { ok: false, error: "Cycle not found." };
  if (cycle.status !== "draft") {
    return { ok: false, error: "Only draft cycles can be deleted — close active cycles instead." };
  }

  const { count } = await supabase
    .from("appraisals")
    .select("id", { count: "exact", head: true })
    .eq("cycle_id", cycleId);
  if ((count ?? 0) > 0) {
    return { ok: false, error: "This cycle already has appraisals and can't be deleted." };
  }

  const { error } = await supabase.from("appraisal_cycles").delete().eq("id", cycleId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Calibration committee adjusts an appraisal's final score, with an audit log. */
export async function applyCalibration(input: {
  appraisalId: string;
  newScore: number;
  reason?: string;
}): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  if (!Number.isFinite(input.newScore) || input.newScore < 0 || input.newScore > 100)
    return { ok: false, error: "Score must be between 0 and 100." };
  const supabase = createClient();
  const a = await loadAppraisal(input.appraisalId);
  if (!a) return { ok: false, error: "Appraisal not found." };
  if (a.status === "closed") return { ok: false, error: "This appraisal is closed." };

  const [{ data: ap }, { data: cyc }] = await Promise.all([
    supabase.from("appraisals").select("final_score, rating_label").eq("id", a.id).maybeSingle(),
    supabase.from("appraisal_cycles").select("rating_bands, name").eq("id", a.cycle_id).maybeSingle(),
  ]);
  if (ap?.final_score == null)
    return { ok: false, error: "This appraisal has no score to calibrate yet." };

  const newScore = Math.round(input.newScore * 10) / 10;
  const newLabel = ratingLabelFromBands(
    newScore,
    (cyc?.rating_bands as RatingBand[] | undefined) ?? null,
  );

  const { error: insErr } = await supabase.from("appraisal_calibration_adjustments").insert({
    tenant_id: a.tenant_id,
    appraisal_id: a.id,
    cycle_id: a.cycle_id,
    previous_score: ap?.final_score ?? null,
    previous_label: ap?.rating_label ?? null,
    new_score: newScore,
    new_label: newLabel,
    reason: input.reason?.trim() || null,
    adjusted_by: await uid(),
  });
  if (insErr) return { ok: false, error: insErr.message };

  const { error: updErr } = await supabase
    .from("appraisals")
    .update({ final_score: newScore, rating_label: newLabel })
    .eq("id", a.id);
  if (updErr) return { ok: false, error: updErr.message };

  await logEvent(
    a,
    "calibration_adjusted",
    `Score ${ap?.final_score ?? "—"}% → ${newScore}% (${newLabel})${
      input.reason?.trim() ? ` — ${input.reason.trim()}` : ""
    }`,
  );
  // Tell the configured recipients the committee finished calibrating. The
  // reason stays committee-confidential; this is just a heads-up.
  await dispatchEvent("calibration_completed", {
    tenantId: a.tenant_id,
    managerIds: a.manager_id ? [a.manager_id] : [],
    secondLevelIds: a.second_level_id ? [a.second_level_id] : [],
    placeholders: {
      cycle: String((cyc as { name?: string } | null)?.name ?? "the cycle"),
      rating: `${newScore}% (${newLabel})`,
    },
    url: "/performance/appraisals",
  });
  rev();
  return { ok: true };
}

// --- HR: department objectives ----------------------------------------------

export async function addDepartmentObjective(input: {
  title: string;
  department?: string;
  description?: string;
  cycleId?: string;
}): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  if (!input.title.trim()) return { ok: false, error: "Objective title is required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("appraisal_department_objectives").insert({
    tenant_id: tenant.id,
    department: input.department?.trim() || null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    cycle_id: input.cycleId || null,
    created_by: await uid(),
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setDepartmentObjectiveActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisal_department_objectives")
    .update({ is_active: active })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// --- Employee: goal setting -------------------------------------------------

const EDITABLE = new Set([
  "not_started",
  "draft",
  "returned_for_correction",
  "pending_manager_review",
]);

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

/**
 * Objective (OKR) weights must total exactly 100% so the weighted score reflects
 * the full allocation. Development goals are weighted separately by the cycle, so
 * they're excluded here. Returns an error message, or null when valid.
 */
type GoalRuleConfig = {
  minGoals: number;
  maxGoals: number;
  minGoalWeight: number;
  maxGoalWeight: number;
  goalWeightsTotal100: boolean;
};

/** Validate objectives against the tenant's configured goal rules. */
function objectiveWeightError(
  goals: { weight: number | null; kind: string }[],
  config?: GoalRuleConfig,
): string | null {
  const objectives = goals.filter((g) => g.kind === "objective");
  const min = config?.minGoals ?? 1;
  if (objectives.length < Math.max(1, min))
    return `Add at least ${Math.max(1, min)} objective${min === 1 ? "" : "s"} (KPI/OKR) before submitting.`;
  if (config && objectives.length > config.maxGoals)
    return `You can set at most ${config.maxGoals} objective${config.maxGoals === 1 ? "" : "s"}.`;
  if (config) {
    for (const g of objectives) {
      const w = g.weight ?? 0;
      if (w < config.minGoalWeight || w > config.maxGoalWeight)
        return `Each objective's weight must be between ${config.minGoalWeight}% and ${config.maxGoalWeight}%.`;
    }
  }
  if (!config || config.goalWeightsTotal100) {
    const sum = objectives.reduce((s, g) => s + (g.weight ?? 0), 0);
    if (sum !== 100) return `Objective weights must total 100% — they currently total ${sum}%.`;
  }
  return null;
}

export async function addGoal(input: {
  appraisalId: string;
  title: string;
  description?: string;
  weight?: number;
  deadline?: string;
  successIndicator?: string;
  alignment?: string;
  evidenceRequired?: string;
  kind?: "objective" | "development";
}): Promise<ActionResult> {
  const guard = await requireEmployeeEditable(input.appraisalId);
  if ("ok" in guard) return guard;
  const a = guard.a;
  if (!input.title.trim()) return { ok: false, error: "Goal title is required." };
  const supabase = createClient();
  const kind = input.kind === "development" ? "development" : "objective";

  // Enforce the tenant's configured cap on the number of objectives.
  if (kind === "objective") {
    const config = await getPerformanceConfig();
    const { count } = await supabase
      .from("appraisal_goals")
      .select("id", { count: "exact", head: true })
      .eq("appraisal_id", a.id)
      .eq("kind", "objective");
    if ((count ?? 0) >= config.maxGoals) {
      return {
        ok: false,
        error: `You can set at most ${config.maxGoals} objective${config.maxGoals === 1 ? "" : "s"}.`,
      };
    }
  }

  const { error } = await supabase.from("appraisal_goals").insert({
    tenant_id: a.tenant_id,
    appraisal_id: a.id,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    weight: Math.max(0, Math.min(100, Math.floor(input.weight ?? 0))),
    deadline: input.deadline || null,
    success_indicator: input.successIndicator?.trim() || null,
    alignment: input.alignment?.trim() || null,
    evidence_required: input.evidenceRequired?.trim() || null,
    kind,
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
  const config = await getPerformanceConfig();
  const { data: goalRows } = await supabase
    .from("appraisal_goals")
    .select("weight, kind, success_indicator, alignment")
    .eq("appraisal_id", a.id);
  const goals = (goalRows ?? []) as {
    weight: number | null;
    kind: string;
    success_indicator: string | null;
    alignment: string | null;
  }[];
  if (goals.length === 0) return { ok: false, error: "Add at least one goal before submitting." };
  const weightError = objectiveWeightError(goals, config);
  if (weightError) return { ok: false, error: weightError };
  const objectives = goals.filter((g) => g.kind === "objective");
  if (config.requireSuccessIndicator && objectives.some((g) => !g.success_indicator?.trim()))
    return { ok: false, error: "Every objective needs a success indicator." };
  if (config.requireAlignment && objectives.some((g) => !g.alignment?.trim()))
    return { ok: false, error: "Every objective must be aligned to a higher-level objective." };
  const { error } = await supabase
    .from("appraisals")
    .update({ status: "pending_manager_review" })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent(a, "goals_submitted");
  const { data: subEmp } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", a.employee_id)
    .maybeSingle();
  await dispatchEvent("goal_submission", {
    tenantId: a.tenant_id,
    employeeIds: [a.employee_id],
    managerIds: a.manager_id ? [a.manager_id] : [],
    placeholders: { employee: (subEmp as { full_name?: string } | null)?.full_name ?? "A team member" },
    url: "/performance/appraisals",
  });
  rev();
  return { ok: true };
}

// --- Manager: goal review ---------------------------------------------------

/** Whether `me` is the appraisal delegate the given manager has nominated. */
async function isDelegateOf(managerId: string | null, me: string | null): Promise<boolean> {
  if (!managerId || !me || managerId === me) return false;
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("appraisal_delegate_id")
    .eq("id", managerId)
    .maybeSingle();
  return (data?.appraisal_delegate_id ?? null) === me;
}

async function requireManager(id: string): Promise<{ a: AppraisalRow } | ActionResult> {
  const a = await loadAppraisal(id);
  if (!a) return { ok: false, error: "Appraisal not found." };
  const me = await uid();
  const access = await getAccess();
  const isReviewer =
    a.manager_id === me ||
    access.isHr ||
    access.isAdmin ||
    access.isSystemAdmin ||
    (await isDelegateOf(a.manager_id, me));
  if (!isReviewer) return { ok: false, error: "Only the line manager (or their delegate) can review this." };
  return { a };
}

/**
 * A manager nominates (or clears) an appraisal delegate — a colleague who may act
 * on their team's appraisals while they're unavailable. Pass null to clear.
 */
export async function setAppraisalDelegate(delegateId: string | null): Promise<ActionResult> {
  const me = await uid();
  if (!me) return { ok: false, error: "You're not signed in." };
  const supabase = createClient();
  if (delegateId) {
    if (delegateId === me) return { ok: false, error: "You can't delegate to yourself." };
    const { data: d } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", delegateId)
      .eq("is_active", true)
      .maybeSingle();
    if (!d) return { ok: false, error: "Choose an active colleague to delegate to." };
  }
  const { error } = await supabase
    .from("profiles")
    .update({ appraisal_delegate_id: delegateId })
    .eq("id", me);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
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
  await dispatchEvent("goal_rejection", {
    tenantId: a.tenant_id,
    employeeIds: [a.employee_id],
    managerIds: a.manager_id ? [a.manager_id] : [],
    placeholders: { reason: input.comment?.trim() || "your manager asked for changes" },
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
    .select("id, title, weight, deadline, success_indicator, description, kind")
    .eq("appraisal_id", a.id);

  const apprConfig = await getPerformanceConfig();
  const weightError = objectiveWeightError(
    (goals ?? []) as { weight: number | null; kind: string }[],
    apprConfig,
  );
  if (weightError) {
    return { ok: false, error: `Can't approve — ${weightError[0].toLowerCase()}${weightError.slice(1)}` };
  }

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
  const { data: myEmp } = await supabase.from("profiles").select("full_name").eq("id", a.employee_id).maybeSingle();
  await dispatchEvent("approval_request", {
    tenantId: a.tenant_id,
    managerIds: a.manager_id ? [a.manager_id] : [],
    secondLevelIds: a.second_level_id ? [a.second_level_id] : [],
    placeholders: { employee: (myEmp as { full_name?: string } | null)?.full_name ?? "A team member" },
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
  const { data: saEmp } = await supabase.from("profiles").select("full_name").eq("id", a.employee_id).maybeSingle();
  await dispatchEvent("approval_request", {
    tenantId: a.tenant_id,
    managerIds: a.manager_id ? [a.manager_id] : [],
    secondLevelIds: a.second_level_id ? [a.second_level_id] : [],
    placeholders: { employee: (saEmp as { full_name?: string } | null)?.full_name ?? "A team member" },
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

  const [{ data: goals }, { data: comps }, { data: compFramework }, { data: cycle }] =
    await Promise.all([
      supabase.from("appraisal_goals").select("kind, weight, manager_rating").eq("appraisal_id", a.id),
      supabase
        .from("appraisal_competency_ratings")
        .select("manager_rating, competency_id")
        .eq("appraisal_id", a.id),
      supabase.from("appraisal_competencies").select("id, weight"),
      supabase
        .from("appraisal_cycles")
        .select("weight_okr, weight_competency, weight_development, require_second_level, rating_bands")
        .eq("id", a.cycle_id)
        .maybeSingle(),
    ]);
  const compWeight = new Map(
    ((compFramework ?? []) as { id: string; weight: number | null }[]).map((c) => [
      c.id,
      Math.max(1, c.weight ?? 1),
    ]),
  );

  // OKR component: weighted (by goal weight) average of objective ratings, 1–5.
  let okrW = 0;
  let okrAcc = 0;
  let okrCount = 0;
  let okrPlain = 0;
  // Development component: simple average of development-goal ratings.
  let devAcc = 0;
  let devCount = 0;
  for (const g of goals ?? []) {
    const r = g.manager_rating as number | null;
    if (r == null) continue;
    if ((g.kind as string) === "development") {
      devAcc += r;
      devCount += 1;
    } else {
      const w = (g.weight as number) || 0;
      okrW += w;
      okrAcc += w * r;
      okrPlain += r;
      okrCount += 1;
    }
  }
  if (okrCount === 0) return { ok: false, error: "Rate at least one objective before submitting." };
  const okrAvg = okrW > 0 ? okrAcc / okrW : okrPlain / okrCount; // 1–5

  // Competency component: weight-weighted average of the manager ratings, 1–5
  // (each competency carries a relative weight; default 1 = equal weighting).
  let compAcc = 0;
  let compW = 0;
  let compCount = 0;
  for (const c of comps ?? []) {
    const r = c.manager_rating as number | null;
    if (r == null) continue;
    const w = compWeight.get(c.competency_id as string) ?? 1;
    compAcc += w * r;
    compW += w;
    compCount += 1;
  }
  const compAvg = compW > 0 ? compAcc / compW : 0;

  // Component %s (rating/5 → %), then weight by the cycle's configured weights,
  // normalising over the components that actually have data.
  const pct = (avg: number) => (avg / 5) * 100;
  const wOkr = (cycle?.weight_okr as number) ?? 70;
  const wComp = (cycle?.weight_competency as number) ?? 20;
  const wDev = (cycle?.weight_development as number) ?? 10;
  let num = pct(okrAvg) * wOkr;
  let den = wOkr;
  if (compCount > 0) {
    num += pct(compAvg) * wComp;
    den += wComp;
  }
  if (devCount > 0) {
    num += pct(devAcc / devCount) * wDev;
    den += wDev;
  }
  const finalScore = den > 0 ? num / den : pct(okrAvg);
  const overall = okrAvg;
  const label = ratingLabelFromBands(
    finalScore,
    (cycle?.rating_bands as RatingBand[] | undefined) ?? null,
  );

  // Route to a second-level approver (the manager's manager) when the cycle
  // requires it and one exists; otherwise straight to HR validation.
  let secondLevelId: string | null = null;
  let nextStage = "hr_review";
  let nextStatus = "pending_hr_review";
  if (cycle?.require_second_level && a.manager_id) {
    const { data: mgr } = await supabase
      .from("profiles")
      .select("manager_id")
      .eq("id", a.manager_id)
      .maybeSingle();
    const sl = (mgr?.manager_id as string | null) ?? null;
    if (sl) {
      secondLevelId = sl;
      nextStage = "manager_review";
      nextStatus = "pending_second_level";
    }
  }

  const { error } = await supabase
    .from("appraisals")
    .update({
      manager_summary: input.summary?.trim() || null,
      overall_rating: Math.round(overall * 100) / 100,
      final_score: Math.round(finalScore * 10) / 10,
      rating_label: label,
      second_level_id: secondLevelId,
      stage: nextStage,
      status: nextStatus,
    })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent({ ...a, stage: "manager_review" }, "manager_evaluation_submitted",
    `Score ${Math.round(finalScore * 10) / 10}% (${label})`);
  if (secondLevelId) {
    await notifyUsers({
      tenantId: a.tenant_id,
      profileIds: [secondLevelId],
      category: "approval",
      title: "Appraisal needs your approval",
      body: "An appraisal from your team needs second-level approval.",
      url: "/performance/appraisals",
    });
  } else {
    await notifyUsers({
      tenantId: a.tenant_id,
      profileIds: [a.employee_id],
      category: "approval",
      title: "Manager evaluation complete",
      body: "Your manager completed your evaluation; it is now with HR for validation.",
      url: "/performance/appraisals",
    });
  }
  rev();
  return { ok: true };
}

// --- Phase 3: HR validation, final discussion, acknowledgement, closure -----

/** HR validates a completed manager evaluation; opens the final discussion. */
export async function hrValidate(appraisalId: string): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  const a = await loadAppraisal(appraisalId);
  if (!a) return { ok: false, error: "Appraisal not found." };
  if (a.stage !== "hr_review" || a.status !== "pending_hr_review")
    return { ok: false, error: "This appraisal is not awaiting HR validation." };
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({ stage: "final_discussion", status: "ready_for_final_discussion" })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent({ ...a, stage: "hr_review" }, "hr_validated");
  const recipients = [a.employee_id, a.manager_id].filter(Boolean) as string[];
  if (recipients.length)
    await notifyUsers({
      tenantId: a.tenant_id,
      profileIds: recipients,
      category: "approval",
      title: "Appraisal validated by HR",
      body: "HR validated the appraisal — schedule the final discussion.",
      url: "/performance/appraisals",
    });
  rev();
  return { ok: true };
}

/** HR returns the appraisal to the manager for correction. */
export async function hrReturnToManager(input: {
  appraisalId: string;
  comment: string;
}): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  const a = await loadAppraisal(input.appraisalId);
  if (!a) return { ok: false, error: "Appraisal not found." };
  if (a.stage !== "hr_review") return { ok: false, error: "Not at HR validation." };
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({ stage: "manager_review", status: "returned_for_correction" })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent({ ...a, stage: "hr_review" }, "hr_returned", input.comment);
  if (a.manager_id)
    await notifyUsers({
      tenantId: a.tenant_id,
      profileIds: [a.manager_id],
      category: "approval",
      title: "HR returned an appraisal",
      body: input.comment?.trim() || "HR asked for corrections to an appraisal.",
      url: "/performance/appraisals",
    });
  rev();
  return { ok: true };
}

/** Manager records the final discussion; sends to the employee to acknowledge. */
export async function recordDiscussion(input: {
  appraisalId: string;
  date: string;
  notes?: string;
}): Promise<ActionResult> {
  const guard = await requireManagerAt(input.appraisalId, ["final_discussion"]);
  if ("ok" in guard) return guard;
  const a = guard.a;
  if (!input.date) return { ok: false, error: "Discussion date is required." };
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({
      discussion_date: input.date,
      discussion_notes: input.notes?.trim() || null,
      stage: "acknowledgement",
      status: "pending_employee_acknowledgement",
    })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent({ ...a, stage: "final_discussion" }, "discussion_recorded");
  await dispatchEvent("acknowledgement_required", {
    tenantId: a.tenant_id,
    employeeIds: [a.employee_id],
    managerIds: a.manager_id ? [a.manager_id] : [],
    url: "/performance/appraisals",
  });
  rev();
  return { ok: true };
}

/** Employee acknowledges the appraisal (agree or disagree). */
export async function acknowledge(input: {
  appraisalId: string;
  agreed: boolean;
  comment?: string;
}): Promise<ActionResult> {
  const a = await loadAppraisal(input.appraisalId);
  if (!a) return { ok: false, error: "Appraisal not found." };
  if (a.employee_id !== (await uid())) return { ok: false, error: "Only the employee can acknowledge." };
  if (a.stage !== "acknowledgement" || a.status !== "pending_employee_acknowledgement")
    return { ok: false, error: "Not awaiting your acknowledgement." };
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({
      acknowledged_at: new Date().toISOString(),
      employee_agreed: input.agreed,
      employee_ack_comment: input.comment?.trim() || null,
      status: input.agreed ? "completed" : "under_appeal",
    })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  if (!input.agreed) {
    await supabase.from("appraisal_appeals").insert({
      tenant_id: a.tenant_id,
      appraisal_id: a.id,
      reason: input.comment?.trim() || null,
      opened_by: await uid(),
    });
  }
  await logEvent(a, input.agreed ? "acknowledged_agree" : "acknowledged_disagree", input.comment);
  const recipients = [a.manager_id].filter(Boolean) as string[];
  if (recipients.length)
    await notifyUsers({
      tenantId: a.tenant_id,
      profileIds: recipients,
      category: "approval",
      title: input.agreed ? "Appraisal acknowledged" : "Appraisal disputed",
      body: input.agreed
        ? "The employee acknowledged their appraisal."
        : "The employee acknowledged but disagrees — HR review may be needed.",
      url: "/performance/appraisals",
    });
  rev();
  return { ok: true };
}

/** HR closes the appraisal — it becomes read-only and enters performance history. */
export async function closeAppraisal(appraisalId: string): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  const a = await loadAppraisal(appraisalId);
  if (!a) return { ok: false, error: "Appraisal not found." };
  if (!["completed", "under_appeal"].includes(a.status))
    return { ok: false, error: "Only acknowledged appraisals can be closed." };
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({ stage: "closed", status: "closed" })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent({ ...a, stage: "acknowledgement" }, "appraisal_closed");
  await dispatchEvent("review_completed", {
    tenantId: a.tenant_id,
    employeeIds: [a.employee_id],
    managerIds: a.manager_id ? [a.manager_id] : [],
    url: "/performance/appraisals",
  });
  rev();
  return { ok: true };
}

/**
 * HR re-opens a closed appraisal to amend it (fix a score/typo, re-calibrate).
 * It returns to the acknowledged `completed` state so HR can adjust the outcome
 * and close it again; the reason is logged for audit.
 */
export async function reopenAppraisal(input: {
  appraisalId: string;
  reason: string;
}): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  if (!input.reason?.trim()) return { ok: false, error: "Give a reason for re-opening." };
  const a = await loadAppraisal(input.appraisalId);
  if (!a) return { ok: false, error: "Appraisal not found." };
  if (a.status !== "closed") return { ok: false, error: "Only a closed appraisal can be re-opened." };
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({ stage: "acknowledgement", status: "completed" })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent({ ...a, stage: "closed" }, "appraisal_reopened", input.reason.trim());
  rev();
  return { ok: true };
}

/** HR resolves an open appeal on a disputed appraisal. */
export async function resolveAppeal(input: {
  appraisalId: string;
  decision: string;
}): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  const a = await loadAppraisal(input.appraisalId);
  if (!a) return { ok: false, error: "Appraisal not found." };
  const supabase = createClient();
  const { data: appeal } = await supabase
    .from("appraisal_appeals")
    .select("id")
    .eq("appraisal_id", a.id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!appeal) return { ok: false, error: "No open appeal to resolve." };
  const { error } = await supabase
    .from("appraisal_appeals")
    .update({
      status: "resolved",
      decision: input.decision?.trim() || null,
      resolved_by: await uid(),
      resolved_at: new Date().toISOString(),
    })
    .eq("id", appeal.id);
  if (error) return { ok: false, error: error.message };
  await logEvent(a, "appeal_resolved", input.decision);
  await notifyUsers({
    tenantId: a.tenant_id,
    profileIds: [a.employee_id],
    category: "approval",
    title: "Appeal resolved",
    body: input.decision?.trim() || "HR recorded a decision on your appeal.",
    url: "/performance/appraisals",
  });
  rev();
  return { ok: true };
}

// --- Phase 4b: competency framework -----------------------------------------

export async function addCompetency(input: {
  name: string;
  description?: string;
  weight?: number;
}): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  if (!input.name.trim()) return { ok: false, error: "Competency name is required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("appraisal_competencies").insert({
    tenant_id: tenant.id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    weight: clampCompetencyWeight(input.weight),
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

function clampCompetencyWeight(w: number | undefined): number {
  if (w === undefined || !Number.isFinite(w)) return 1;
  return Math.max(1, Math.min(100, Math.floor(w)));
}

export async function setCompetencyActive(id: string, isActive: boolean): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisal_competencies")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** HR sets a competency's relative weight in the score (1 = default). */
export async function setCompetencyWeight(id: string, weight: number): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisal_competencies")
    .update({ weight: clampCompetencyWeight(weight) })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function rateCompetencySelf(input: {
  appraisalId: string;
  competencyId: string;
  rating: number;
}): Promise<ActionResult> {
  const guard = await requireEmployeeAt(input.appraisalId, ["self_assessment"]);
  if ("ok" in guard) return guard;
  const a = guard.a;
  const supabase = createClient();
  const { error } = await supabase.from("appraisal_competency_ratings").upsert(
    {
      tenant_id: a.tenant_id,
      appraisal_id: a.id,
      competency_id: input.competencyId,
      employee_rating: Math.max(0, Math.min(5, input.rating)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "appraisal_id,competency_id" },
  );
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function rateCompetencyManager(input: {
  appraisalId: string;
  competencyId: string;
  rating?: number;
  comment?: string;
}): Promise<ActionResult> {
  const guard = await requireManagerAt(input.appraisalId, ["manager_review"]);
  if ("ok" in guard) return guard;
  const a = guard.a;
  const supabase = createClient();
  const row: Record<string, unknown> = {
    tenant_id: a.tenant_id,
    appraisal_id: a.id,
    competency_id: input.competencyId,
    updated_at: new Date().toISOString(),
  };
  if (input.rating !== undefined) row.manager_rating = Math.max(0, Math.min(5, input.rating));
  if (input.comment !== undefined) row.manager_comment = input.comment.trim() || null;
  const { error } = await supabase
    .from("appraisal_competency_ratings")
    .upsert(row, { onConflict: "appraisal_id,competency_id" });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** HR: send reminders now (flag overdue goal-setting + nudge current owners). */
export async function sendAppraisalReminders(): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const res = await runAppraisalReminders(tenant.id as string);
  if (!res.ok) return { ok: false, error: res.error ?? "Could not send reminders." };
  rev();
  return { ok: true };
}

// --- OKR key results (define during goal-setting, track during the year) ----

export async function addKeyResult(input: {
  appraisalId: string;
  goalId: string;
  title: string;
  target?: string;
  unit?: string;
}): Promise<ActionResult> {
  const guard = await requireEmployeeEditable(input.appraisalId);
  if ("ok" in guard) return guard;
  const a = guard.a;
  if (!input.title.trim()) return { ok: false, error: "Key result is required." };
  const supabase = createClient();
  const { error } = await supabase.from("appraisal_key_results").insert({
    tenant_id: a.tenant_id,
    appraisal_id: a.id,
    goal_id: input.goalId,
    title: input.title.trim(),
    target: input.target?.trim() || null,
    unit: input.unit?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function deleteKeyResult(input: {
  appraisalId: string;
  krId: string;
}): Promise<ActionResult> {
  const guard = await requireEmployeeEditable(input.appraisalId);
  if ("ok" in guard) return guard;
  const supabase = createClient();
  const { error } = await supabase.from("appraisal_key_results").delete().eq("id", input.krId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Continuous tracking: employee updates a key result's progress during the year. */
export async function updateKeyResultProgress(input: {
  appraisalId: string;
  krId: string;
  currentValue?: string;
  progress?: number;
}): Promise<ActionResult> {
  const guard = await requireEmployeeAt(input.appraisalId, ["goal_review", "self_assessment"]);
  if ("ok" in guard) return guard;
  const supabase = createClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.currentValue !== undefined) patch.current_value = input.currentValue.trim() || null;
  if (input.progress !== undefined) patch.progress = Math.max(0, Math.min(100, Math.floor(input.progress)));
  const { error } = await supabase.from("appraisal_key_results").update(patch).eq("id", input.krId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// --- Second-level approval --------------------------------------------------

async function requireSecondLevelApprover(
  id: string,
): Promise<{ a: AppraisalRow } | ActionResult> {
  const a = await loadAppraisal(id);
  if (!a) return { ok: false, error: "Appraisal not found." };
  const me = await uid();
  const access = await getAccess();
  const ok = a.second_level_id === me || access.isHr || access.isAdmin || access.isSystemAdmin;
  if (!ok) return { ok: false, error: "Only the second-level approver can action this." };
  if (a.status !== "pending_second_level")
    return { ok: false, error: "Not awaiting second-level approval." };
  return { a };
}

export async function secondLevelApprove(appraisalId: string): Promise<ActionResult> {
  const guard = await requireSecondLevelApprover(appraisalId);
  if ("ok" in guard) return guard;
  const a = guard.a;
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({ stage: "hr_review", status: "pending_hr_review" })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent({ ...a, stage: "manager_review" }, "second_level_approved");
  rev();
  return { ok: true };
}

export async function secondLevelReturn(input: {
  appraisalId: string;
  comment: string;
}): Promise<ActionResult> {
  const guard = await requireSecondLevelApprover(input.appraisalId);
  if ("ok" in guard) return guard;
  const a = guard.a;
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({ status: "returned_for_correction" })
    .eq("id", a.id);
  if (error) return { ok: false, error: error.message };
  await logEvent({ ...a, stage: "manager_review" }, "second_level_returned", input.comment);
  if (a.manager_id)
    await notifyUsers({
      tenantId: a.tenant_id,
      profileIds: [a.manager_id],
      category: "approval",
      title: "Appraisal returned by second-level approver",
      body: input.comment?.trim() || "The second-level approver asked for corrections.",
      url: "/performance/appraisals",
    });
  rev();
  return { ok: true };
}

// --- Development plans (IDPs) -----------------------------------------------

async function requireParticipantOpen(id: string): Promise<{ a: AppraisalRow } | ActionResult> {
  const a = await loadAppraisal(id);
  if (!a) return { ok: false, error: "Appraisal not found." };
  const me = await uid();
  const access = await getAccess();
  const ok =
    a.employee_id === me ||
    a.manager_id === me ||
    a.second_level_id === me ||
    access.isHr ||
    access.isAdmin ||
    access.isSystemAdmin;
  if (!ok) return { ok: false, error: "Not your appraisal." };
  if (a.status === "closed") return { ok: false, error: "This appraisal is closed." };
  return { a };
}

export async function addDevelopmentItem(input: {
  appraisalId: string;
  area: string;
  action?: string;
  targetDate?: string;
}): Promise<ActionResult> {
  const guard = await requireParticipantOpen(input.appraisalId);
  if ("ok" in guard) return guard;
  const a = guard.a;
  if (!input.area.trim()) return { ok: false, error: "Development area is required." };
  const supabase = createClient();
  const { error } = await supabase.from("appraisal_development_plans").insert({
    tenant_id: a.tenant_id,
    appraisal_id: a.id,
    area: input.area.trim(),
    action: input.action?.trim() || null,
    target_date: input.targetDate || null,
    created_by: await uid(),
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setDevelopmentStatus(input: {
  appraisalId: string;
  itemId: string;
  status: "planned" | "in_progress" | "done";
}): Promise<ActionResult> {
  const guard = await requireParticipantOpen(input.appraisalId);
  if ("ok" in guard) return guard;
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisal_development_plans")
    .update({ status: input.status })
    .eq("id", input.itemId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function deleteDevelopmentItem(input: {
  appraisalId: string;
  itemId: string;
}): Promise<ActionResult> {
  const guard = await requireParticipantOpen(input.appraisalId);
  if ("ok" in guard) return guard;
  const supabase = createClient();
  const { error } = await supabase
    .from("appraisal_development_plans")
    .delete()
    .eq("id", input.itemId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// --- Stakeholder goal reviewers --------------------------------------------

/** Employee (or manager/HR) attaches a business colleague to review a goal. */
export async function addGoalRater(input: {
  appraisalId: string;
  goalId: string;
  raterId: string;
}): Promise<ActionResult> {
  const guard = await requireParticipantOpen(input.appraisalId);
  if ("ok" in guard) return guard;
  const a = guard.a;
  if (!input.raterId) return { ok: false, error: "Pick a witness." };
  if (input.raterId === a.employee_id)
    return { ok: false, error: "You can't add yourself as a witness." };
  const supabase = createClient();
  // One witness per objective.
  const { count } = await supabase
    .from("appraisal_goal_raters")
    .select("id", { count: "exact", head: true })
    .eq("goal_id", input.goalId);
  if ((count ?? 0) >= 1)
    return { ok: false, error: "This objective already has a witness. Remove them first." };
  const { error } = await supabase.from("appraisal_goal_raters").insert({
    tenant_id: a.tenant_id,
    appraisal_id: a.id,
    goal_id: input.goalId,
    rater_id: input.raterId,
    created_by: await uid(),
  });
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "This objective already has a witness." };
    return { ok: false, error: error.message };
  }
  // Grant the assessor the view-only "Witness" role so they can reach the
  // appraisals page and rate the goal under strict module gating.
  await supabase.rpc("ensure_witness_role", { p_rater: input.raterId });
  await notifyUsers({
    tenantId: a.tenant_id,
    profileIds: [input.raterId],
    category: "general",
    title: "Performance feedback requested",
    body: "You've been asked to rate a colleague's performance on an objective.",
    url: "/performance/appraisals",
  });
  rev();
  return { ok: true };
}

/** Employee (or manager/HR) removes a reviewer from a goal. */
export async function removeGoalRater(input: {
  appraisalId: string;
  raterRowId: string;
}): Promise<ActionResult> {
  const guard = await requireParticipantOpen(input.appraisalId);
  if ("ok" in guard) return guard;
  const supabase = createClient();
  const { data: row } = await supabase
    .from("appraisal_goal_raters")
    .select("rater_id")
    .eq("id", input.raterRowId)
    .maybeSingle();
  const { error } = await supabase
    .from("appraisal_goal_raters")
    .delete()
    .eq("id", input.raterRowId);
  if (error) return { ok: false, error: error.message };
  // Drop the auto Witness role if this was their last assessment.
  if (row?.rater_id) {
    await supabase.rpc("revoke_witness_role_if_unused", { p_rater: row.rater_id });
  }
  rev();
  return { ok: true };
}

/** The stakeholder submits (or revises) their rating + comment for a goal.
 *  Authorisation is enforced by RLS — only the assigned rater can update. */
export async function submitGoalRating(input: {
  assignmentId: string;
  rating: number;
  comment?: string;
}): Promise<ActionResult> {
  const me = await uid();
  if (!me) return { ok: false, error: "Not signed in." };
  if (!input.rating || input.rating < 1 || input.rating > 5)
    return { ok: false, error: "Rating must be between 1 and 5." };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("appraisal_goal_raters")
    .update({
      rating: input.rating,
      comment: input.comment?.trim() || null,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", input.assignmentId)
    .eq("rater_id", me)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0)
    return { ok: false, error: "This review request isn't assigned to you." };
  // Let the line manager know stakeholder feedback has come in.
  const { data: tgt } = await supabase.rpc("goal_rating_target", {
    p_assignment: input.assignmentId,
  });
  const t = Array.isArray(tgt) ? tgt[0] : tgt;
  if (t?.manager_id) {
    await notifyUsers({
      tenantId: t.tenant_id,
      profileIds: [t.manager_id],
      category: "general",
      title: "Stakeholder feedback received",
      body: `A reviewer rated ${t.employee_name ?? "an employee"}'s objective “${t.goal_title}”.`,
      url: "/performance/appraisals",
    });
  }
  rev();
  return { ok: true };
}
