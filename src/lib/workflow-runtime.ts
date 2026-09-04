import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import { mayProxy } from "@/lib/performance/proxy";
import { activeStageKeys, type EmployeeContext } from "@/lib/workflow-engine";
import type { StageRole, WorkflowStage } from "@/types/workflow";

export interface AppraisalWorkflow {
  appraisalId: string;
  tenantId: string | null;
  stages: WorkflowStage[];
  ctx: EmployeeContext;
  /** Stage keys already completed. */
  completedStages: string[];
  /** Stage keys actionable right now (>1 when a parallel group is in flight). */
  activeKeys: string[];
  /** Terminal flag: "completed" | "rejected" | null. */
  terminal: "completed" | "rejected" | null;
  /** Roles the signed-in user holds for THIS appraisal. */
  userRoles: StageRole[];
  /** True when the user is an administrator who may stand in for anybody here. */
  canProxy: boolean;
  /** The three parties, so a proxy step can name who it was taken for. */
  parties: { employee_id: string | null; manager_id: string | null; second_level_id: string | null };
}

/**
 * Resolve the configured workflow for a live appraisal, or null when its cycle
 * wasn't launched from a template with stages (legacy appraisals are unaffected).
 */
export async function getAppraisalWorkflow(appraisalId: string): Promise<AppraisalWorkflow | null> {
  const map = await getAppraisalWorkflows([appraisalId]);
  return map[appraisalId] ?? null;
}

/**
 * The same, for several appraisals in one pass.
 *
 * A manager's page resolved each report's workflow separately: an appraisal
 * read, a cycle read, a template read, a profile read, a headcount, an auth
 * check and an access check — seven round trips per report, most of them
 * returning the same cycle and the same template every time. Read each thing
 * once, and the viewer's identity once, then assemble per appraisal.
 */
export async function getAppraisalWorkflows(
  appraisalIds: string[],
): Promise<Record<string, AppraisalWorkflow>> {
  const out: Record<string, AppraisalWorkflow> = {};
  if (appraisalIds.length === 0) return out;
  const supabase = createClient();

  const { data: rows } = await supabase
    .from("appraisals")
    .select("id, tenant_id, employee_id, manager_id, second_level_id, current_stage_key, completed_stages, cycle_id")
    .in("id", appraisalIds);
  const aps = (rows ?? []) as Record<string, unknown>[];
  if (aps.length === 0) return out;

  const cycleIds = [...new Set(aps.map((a) => String(a.cycle_id)))];
  const employeeIds = [...new Set(aps.map((a) => String(a.employee_id)))];

  const [{ data: cycles }, { data: emps }, { data: managed }, userRes, access] = await Promise.all([
    supabase.from("appraisal_cycles").select("id, template_id").in("id", cycleIds),
    supabase.from("profiles").select("id, department").in("id", employeeIds),
    // Who among the employees manages anybody: one read of the reporting line
    // instead of a headcount per person.
    supabase.from("profiles").select("manager_id").in("manager_id", employeeIds),
    supabase.auth.getUser(),
    getAccess(),
  ]);

  const templateByCycle = new Map(
    ((cycles ?? []) as Record<string, unknown>[]).map((c) => [
      String(c.id),
      (c.template_id as string | null) ?? null,
    ]),
  );
  const templateIds = [...new Set([...templateByCycle.values()].filter((t): t is string => !!t))];
  const { data: tpls } = templateIds.length
    ? await supabase.from("cycle_templates").select("id, config").in("id", templateIds)
    : { data: [] as Record<string, unknown>[] };
  const stagesByTemplate = new Map<string, WorkflowStage[]>();
  for (const t of (tpls ?? []) as Record<string, unknown>[]) {
    const cfg = (t.config as Record<string, unknown>) ?? {};
    stagesByTemplate.set(
      String(t.id),
      Array.isArray(cfg.stages) ? (cfg.stages as WorkflowStage[]) : [],
    );
  }

  const departmentOf = new Map(
    ((emps ?? []) as Record<string, unknown>[]).map((e) => [
      String(e.id),
      (e.department as string | null) ?? null,
    ]),
  );
  const managers = new Set(
    ((managed ?? []) as Record<string, unknown>[]).map((m) => String(m.manager_id)),
  );
  const user = userRes.data.user;
  const isAdmin = access.isHr || access.isSystemAdmin || access.isAdmin;

  for (const ap of aps) {
    const templateId = templateByCycle.get(String(ap.cycle_id));
    if (!templateId) continue;
    const stages = stagesByTemplate.get(templateId) ?? [];
    if (stages.length === 0) continue;

    // Employee context for stage conditions. Management-grade is approximated
    // by "manages at least one person" until an explicit grade field exists.
    const employeeId = String(ap.employee_id);
    const isManager = managers.has(employeeId);
    const ctx: EmployeeContext = {
      department: departmentOf.get(employeeId) ?? null,
      isManager,
      isManagementGrade: isManager,
    };

    const completedStages = Array.isArray(ap.completed_stages)
      ? (ap.completed_stages as string[])
      : [];
    const sentinel = ap.current_stage_key as string | null;
    const terminal = sentinel === "__rejected__" ? "rejected" : null;
    const activeKeys = terminal ? [] : activeStageKeys(stages, ctx, completedStages);

    const userRoles: StageRole[] = [];
    if (user) {
      if (user.id === ap.employee_id) userRoles.push("employee");
      if (user.id === ap.manager_id) userRoles.push("line_manager");
      if (user.id === ap.second_level_id) userRoles.push("second_level");
    }
    // Nobody reviews their own appraisal.
    //
    // Administrator powers exist to act for somebody who cannot act for
    // themselves. On your own record there is nobody to act for, so taking the
    // reviewer's step is signing off your own work — the audit trail naming you
    // as acting for your own manager records the fact without preventing it.
    // Somebody who is both an HR admin and an employee holds both hats; on their
    // own appraisal only the employee one applies.
    const isOwnAppraisal = !!user && user.id === (ap.employee_id as string | null);
    const canProxy = mayProxy({
      isAdmin,
      viewerId: user?.id ?? null,
      employeeId: (ap.employee_id as string | null) ?? null,
    });
    if (canProxy) {
      userRoles.push("hr", "calibration");
    }
    // The final rating may be recorded by the PGM or by an HR admin, so holding
    // either counts as holding the stage's role — recording it is their own work,
    // not a proxy for somebody else. Not on their own rating, though.
    if (access.isPgm && !isOwnAppraisal) userRoles.push("pgm");

    out[String(ap.id)] = {
      appraisalId: ap.id as string,
      tenantId: (ap.tenant_id as string | null) ?? null,
      stages,
      ctx,
      completedStages,
      activeKeys,
      terminal: terminal ?? (activeKeys.length === 0 ? "completed" : null),
      userRoles,
      canProxy,
      parties: {
        employee_id: (ap.employee_id as string | null) ?? null,
        manager_id: (ap.manager_id as string | null) ?? null,
        second_level_id: (ap.second_level_id as string | null) ?? null,
      },
    };
  }
  return out;
}

/**
 * The live step that belongs to the employee, if it is their turn.
 *
 * The panels an employee types into are chosen by the appraisal's legacy
 * `stage`, which the fourteen-step workflow never touches — so a cycle sitting
 * in Mid Year Review still showed the goal-setting panel and there was nowhere
 * to record progress. The workflow already declares which fields each step
 * opens; this reads that, so the two agree on whose turn it is and on what
 * they are being asked for.
 */
export async function employeeLiveStage(appraisalId: string): Promise<WorkflowStage | null> {
  return liveStageFor(appraisalId, ["employee"]);
}

/**
 * The live step that belongs to the reviewer, if it is their turn.
 *
 * The employee side gained a workflow fallback and the manager side did not, so
 * a reviewer whose workflow step was live but whose legacy `stage` was stale —
 * which is most of them, since taking a workflow step never moves it — was
 * refused by every manager action.
 */
export async function managerLiveStage(appraisalId: string): Promise<WorkflowStage | null> {
  return liveStageFor(appraisalId, ["line_manager", "second_level"]);
}

/** The earliest live stage owned by any of `roles` — the one holding things up. */
async function liveStageFor(
  appraisalId: string,
  roles: StageRole[],
): Promise<WorkflowStage | null> {
  const wf = await getAppraisalWorkflow(appraisalId);
  if (!wf || wf.terminal) return null;
  const order = new Map(wf.stages.map((s, i) => [s.key, i]));
  return (
    wf.activeKeys
      .map((k) => wf.stages.find((s) => s.key === k))
      .filter((s): s is WorkflowStage => !!s && roles.includes(s.responsibleRole))
      .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))[0] ?? null
  );
}
