import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import { firstStageKey, skipAutoStages, type EmployeeContext } from "@/lib/workflow-engine";
import type { StageRole, WorkflowStage } from "@/types/workflow";

export interface AppraisalWorkflow {
  appraisalId: string;
  tenantId: string | null;
  stages: WorkflowStage[];
  ctx: EmployeeContext;
  currentStageKey: string;
  /** Roles the signed-in user holds for THIS appraisal. */
  userRoles: StageRole[];
}

/**
 * Resolve the configured workflow for a live appraisal, or null when its cycle
 * wasn't launched from a template with stages (legacy appraisals are unaffected).
 */
export async function getAppraisalWorkflow(appraisalId: string): Promise<AppraisalWorkflow | null> {
  const supabase = createClient();
  const { data: a } = await supabase
    .from("appraisals")
    .select("id, tenant_id, employee_id, manager_id, second_level_id, current_stage_key, cycle_id")
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

  const currentStageKey =
    (ap.current_stage_key as string | null) ??
    skipAutoStages(stages, ctx, firstStageKey(stages, ctx) ?? "");

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
  if (access.isHr || access.isSystemAdmin || access.isAdmin) {
    userRoles.push("hr", "calibration");
  }

  return {
    appraisalId: ap.id as string,
    tenantId: (ap.tenant_id as string | null) ?? null,
    stages,
    ctx,
    currentStageKey,
    userRoles,
  };
}
