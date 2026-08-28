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
  const supabase = createClient();
  const { data: a } = await supabase
    .from("appraisals")
    .select("id, tenant_id, employee_id, manager_id, second_level_id, current_stage_key, completed_stages, cycle_id")
    .eq("id", appraisalId)
    .maybeSingle();
  if (!a) return null;
  const ap = a as Record<string, unknown>;

  const { data: cyc } = await supabase
    .from("appraisal_cycles")
    .select("template_id")
    .eq("id", ap.cycle_id as string)
    .maybeSingle();
  const templateId = (cyc as Record<string, unknown> | null)?.template_id as string | undefined;
  if (!templateId) return null;

  const { data: tpl } = await supabase
    .from("cycle_templates")
    .select("config")
    .eq("id", templateId)
    .maybeSingle();
  const cfg = ((tpl as Record<string, unknown> | null)?.config as Record<string, unknown>) ?? {};
  const stages: WorkflowStage[] = Array.isArray(cfg.stages) ? (cfg.stages as WorkflowStage[]) : [];
  if (stages.length === 0) return null;

  // Employee context for stage conditions. Management-grade is approximated by
  // "manages at least one person" until an explicit grade field exists.
  const { data: emp } = await supabase
    .from("profiles")
    .select("department")
    .eq("id", ap.employee_id as string)
    .maybeSingle();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("manager_id", ap.employee_id as string);
  const isManager = (count ?? 0) > 0;
  const ctx: EmployeeContext = {
    department: (emp as Record<string, unknown> | null)?.department as string | null,
    isManager,
    isManagementGrade: isManager,
  };

  const completedStages = Array.isArray(ap.completed_stages) ? (ap.completed_stages as string[]) : [];
  const sentinel = ap.current_stage_key as string | null;
  const terminal = sentinel === "__rejected__" ? "rejected" : null;
  const activeKeys = terminal ? [] : activeStageKeys(stages, ctx, completedStages);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = await getAccess();
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
    isAdmin: access.isHr || access.isSystemAdmin || access.isAdmin,
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

  return {
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
