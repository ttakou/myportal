/**
 * Workflow engine (pure) — interprets a cycle template's configured stages
 * (`config.stages`, authored in the workflow designer) to decide how a live
 * appraisal moves: which stage is current, who is responsible, what they may
 * edit, and what the next stage is after an action.
 *
 * This module is intentionally free of any DB/IO so it can be unit-tested and
 * reused on both server and client. Wiring it into the live appraisal actions
 * and UI is layered on top of this.
 */
import type { StageField, StageRole, WorkflowStage } from "@/types/workflow";

/** Facts about the appraised employee used to evaluate stage conditions. */
export interface EmployeeContext {
  grade?: string | null;
  department?: string | null;
  isManagementGrade?: boolean;
  isManager?: boolean;
}

export type StageAction = "submit" | "approve" | "return" | "reject";

/** Terminal markers returned when there is no further stage. */
export const COMPLETED = "__completed__";
export const REJECTED = "__rejected__";

/**
 * Evaluate a stage `condition` against the employee context. Supported tokens
 * (case-insensitive `key:value`); an empty/unknown condition never blocks:
 *   grade:management        → management-grade employees only
 *   grade:<name>            → exact grade match
 *   department:<name>       → exact department match
 *   manager:true            → employee is themselves a line manager
 */
export function evalCondition(condition: string | null | undefined, ctx: EmployeeContext): boolean {
  if (!condition || !condition.trim()) return true;
  // Allow several semicolon-separated clauses, all of which must hold.
  return condition
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean)
    .every((clause) => evalClause(clause, ctx));
}

function evalClause(clause: string, ctx: EmployeeContext): boolean {
  const negate = clause.startsWith("!");
  const body = negate ? clause.slice(1) : clause;
  const [rawKey, ...rest] = body.split(":");
  const key = rawKey.trim().toLowerCase();
  const value = rest.join(":").trim().toLowerCase();
  let result: boolean;
  switch (key) {
    case "grade":
      result =
        value === "management"
          ? !!ctx.isManagementGrade
          : (ctx.grade ?? "").toLowerCase() === value;
      break;
    case "department":
      result = (ctx.department ?? "").toLowerCase() === value;
      break;
    case "manager":
      result = value === "true" ? !!ctx.isManager : !ctx.isManager;
      break;
    default:
      result = true; // unknown conditions don't block progression
  }
  return negate ? !result : result;
}

/** Stages that apply to this employee, in order (condition-filtered). */
export function applicableStages(stages: WorkflowStage[], ctx: EmployeeContext): WorkflowStage[] {
  return (stages ?? []).filter((s) => evalCondition(s.condition, ctx));
}

export function stageByKey(stages: WorkflowStage[], key: string | null): WorkflowStage | null {
  if (!key) return null;
  return stages.find((s) => s.key === key) ?? null;
}

/** The first applicable stage's key (where a new appraisal starts). */
export function firstStageKey(stages: WorkflowStage[], ctx: EmployeeContext): string | null {
  return applicableStages(stages, ctx)[0]?.key ?? null;
}

/** Index of a stage within the applicable list (-1 if not present/applicable). */
function applicableIndex(stages: WorkflowStage[], ctx: EmployeeContext, key: string): number {
  return applicableStages(stages, ctx).findIndex((s) => s.key === key);
}

/** Key of the next applicable stage after `currentKey`, or COMPLETED at the end. */
export function nextStageKey(
  stages: WorkflowStage[],
  ctx: EmployeeContext,
  currentKey: string,
): string {
  const list = applicableStages(stages, ctx);
  const i = list.findIndex((s) => s.key === currentKey);
  if (i === -1) return currentKey;
  return i + 1 < list.length ? list[i + 1].key : COMPLETED;
}

/** Key of the previous applicable stage (for return-for-correction), or null. */
export function prevStageKey(
  stages: WorkflowStage[],
  ctx: EmployeeContext,
  currentKey: string,
): string | null {
  const list = applicableStages(stages, ctx);
  const i = list.findIndex((s) => s.key === currentKey);
  return i > 0 ? list[i - 1].key : null;
}

/** Whether `role` is the party responsible for acting on a stage. */
export function canAct(stage: WorkflowStage | null, role: StageRole): boolean {
  return !!stage && stage.responsibleRole === role;
}

/** Fields a role may edit at a stage (only the responsible role can edit). */
export function editableFields(stage: WorkflowStage | null, role: StageRole): StageField[] {
  if (!stage || stage.responsibleRole !== role) return [];
  return stage.editableFields;
}

export interface TransitionResult {
  nextKey: string; // next stage key, or COMPLETED / REJECTED
  done: boolean;
  rejected: boolean;
}

/**
 * Apply an action at the current stage and compute the resulting stage.
 * - submit/approve → advance to the next applicable stage (or COMPLETED)
 * - return         → go back to the previous stage for correction (no-op at start)
 * - reject         → REJECTED terminal state
 */
export function transition(
  stages: WorkflowStage[],
  ctx: EmployeeContext,
  currentKey: string,
  action: StageAction,
): TransitionResult {
  const current = stageByKey(stages, currentKey);
  if (action === "reject") {
    if (!current?.allowReject) return { nextKey: currentKey, done: false, rejected: false };
    return { nextKey: REJECTED, done: false, rejected: true };
  }
  if (action === "return") {
    if (!current?.allowReturn) return { nextKey: currentKey, done: false, rejected: false };
    const prev = prevStageKey(stages, ctx, currentKey);
    return { nextKey: prev ?? currentKey, done: false, rejected: false };
  }
  // submit / approve
  if (action === "approve" && current && !current.allowApprove) {
    // Stage has no explicit approval gate — treat approve like submit anyway.
  }
  if (applicableIndex(stages, ctx, currentKey) === -1) {
    return { nextKey: currentKey, done: false, rejected: false };
  }
  const next = nextStageKey(stages, ctx, currentKey);
  return { nextKey: next, done: next === COMPLETED, rejected: false };
}

/** Convenience: progress %, counting completed stages up to (not incl.) current. */
export function progressPercent(
  stages: WorkflowStage[],
  ctx: EmployeeContext,
  currentKey: string | null,
): number {
  const list = applicableStages(stages, ctx);
  if (list.length === 0) return 0;
  if (currentKey === COMPLETED) return 100;
  const i = currentKey ? list.findIndex((s) => s.key === currentKey) : 0;
  if (i < 0) return 0;
  return Math.round((i / list.length) * 100);
}
