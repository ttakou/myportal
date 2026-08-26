/**
 * Where every participant stands, stage by stage.
 *
 * The system already knows which stage an appraisal sits on and which stages it
 * has finished, but nothing ever turned that into a report: HR could see each
 * person's rating and nothing about their progress. These functions turn the
 * stored state into rows an administrator can read, filter and export.
 *
 * Pure — no IO — so the same numbers drive the on-screen report, the workbook
 * and the deadline view without any chance of the three disagreeing.
 */

import {
  activeStageKeys,
  applicableStages,
  stageDueDate,
  type EmployeeContext,
} from "@/lib/workflow-engine";
import type { StageRole, WorkflowStage } from "@/types/workflow";
import { STAGE_ROLE_LABEL } from "@/types/workflow";

/** How one participant stands at one stage. */
export type StageState = "done" | "current" | "upcoming";

export const STAGE_STATE_LABEL: Record<StageState, string> = {
  done: "Complete",
  current: "In progress",
  upcoming: "Not started",
};

export interface ParticipantStageCell {
  key: string;
  label: string;
  state: StageState;
  responsibleRole: StageRole;
  /** Null when nothing in the configuration gives this stage a date. */
  dueDate: string | null;
  /** Only a stage somebody is actually sitting on, on a known date, can be late. */
  overdue: boolean;
  daysLate: number;
}

export interface ParticipantProgress {
  appraisalId: string;
  employeeName: string;
  department: string | null;
  managerName: string | null;
  cycleName: string;
  stages: ParticipantStageCell[];
  completedCount: number;
  totalCount: number;
  percentComplete: number;
  currentStageLabel: string | null;
  currentStageOwner: string | null;
  currentStageDue: string | null;
  /** Days past due on the current stage; 0 when on time or finished. */
  daysLate: number;
  finished: boolean;
}

export interface ProgressInput {
  appraisalId: string;
  employeeName: string;
  department?: string | null;
  managerName?: string | null;
  cycleName: string;
  /**
   * Start of the cycle, from which each stage's offset is counted. Null for a
   * cycle with no workflow template: the stages then carry no dates of their
   * own, and inventing some would be worse than showing none.
   */
  cycleStart: string | null;
  stages: WorkflowStage[];
  completedStages: string[];
  employee?: EmployeeContext;
  /** Explicit dates for named stages, overriding the offset calculation. */
  dueDates?: Record<string, string | null>;
}

const DAY_MS = 86_400_000;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

/**
 * One participant's row.
 *
 * "Current" comes from the workflow engine rather than from a stored pointer,
 * so a parallel group correctly shows every stage in it as current, and a stage
 * that no longer applies to this employee drops out of the count instead of
 * making them look permanently unfinished.
 */
export function participantProgress(
  input: ProgressInput,
  todayIso: string,
): ParticipantProgress {
  const ctx = input.employee ?? {};
  const applicable = applicableStages(input.stages, ctx);
  const doneKeys = new Set(input.completedStages ?? []);
  const activeKeys = new Set(activeStageKeys(input.stages, ctx, input.completedStages ?? []));

  const stages: ParticipantStageCell[] = applicable.map((s) => {
    const dueDate = Object.prototype.hasOwnProperty.call(input.dueDates ?? {}, s.key)
      ? (input.dueDates?.[s.key] ?? null)
      : input.cycleStart
        ? stageDueDate(s, input.cycleStart)
        : null;
    const state: StageState = doneKeys.has(s.key)
      ? "done"
      : activeKeys.has(s.key)
        ? "current"
        : "upcoming";
    // Only the stage somebody is sitting on is late. A future stage past its
    // date is a symptom of the stage before it, and counting both would make
    // one stuck appraisal look like five separate failures.
    const late = state === "current" && dueDate !== null && dueDate < todayIso;
    return {
      key: s.key,
      label: s.label,
      state,
      responsibleRole: s.responsibleRole,
      dueDate,
      overdue: late,
      daysLate: late && dueDate ? daysBetween(dueDate, todayIso) : 0,
    };
  });

  const completedCount = stages.filter((s) => s.state === "done").length;
  const totalCount = stages.length;
  const current = stages.find((s) => s.state === "current") ?? null;

  return {
    appraisalId: input.appraisalId,
    employeeName: input.employeeName,
    department: input.department ?? null,
    managerName: input.managerName ?? null,
    cycleName: input.cycleName,
    stages,
    completedCount,
    totalCount,
    percentComplete: totalCount ? Math.round((completedCount / totalCount) * 100) : 0,
    currentStageLabel: current?.label ?? null,
    currentStageOwner: current ? STAGE_ROLE_LABEL[current.responsibleRole] : null,
    currentStageDue: current?.dueDate ?? null,
    daysLate: current?.daysLate ?? 0,
    finished: totalCount > 0 && completedCount === totalCount,
  };
}

/**
 * The stage ladder a cycle without a workflow template actually runs.
 *
 * Most cycles were launched before the workflow designer existed and carry no
 * template, so a report that only understood configured stages would show them
 * as blank. These are the same eight stages the legacy flow moves through, in
 * the same order, so those cycles report properly too.
 */
export const LEGACY_STAGE_LADDER: { key: string; label: string; role: StageRole }[] = [
  { key: "goal_setting", label: "Goal setting", role: "employee" },
  { key: "goal_review", label: "Mid-year review", role: "line_manager" },
  { key: "self_assessment", label: "Self-assessment", role: "employee" },
  { key: "manager_review", label: "Manager review", role: "line_manager" },
  { key: "hr_review", label: "HR validation", role: "hr" },
  { key: "final_discussion", label: "Final discussion", role: "line_manager" },
  { key: "acknowledgement", label: "Acknowledgement", role: "employee" },
  { key: "closed", label: "Closed", role: "hr" },
];

export function legacyStages(): WorkflowStage[] {
  return LEGACY_STAGE_LADDER.map((s) => ({
    key: s.key,
    label: s.label,
    responsibleRole: s.role,
    dueOffsetDays: 0,
    mandatory: true,
    editableFields: [],
    allowApprove: false,
    allowReject: false,
    allowReturn: false,
    autoProgress: false,
    parallelGroup: null,
    condition: null,
    notify: true,
  }));
}

/**
 * Which ladder stages a legacy appraisal has already passed.
 *
 * The legacy model stores only where somebody is, not what they finished, so
 * everything before the current stage counts as done — and a closed appraisal
 * counts as finished outright.
 */
export function legacyCompletedStages(stage: string | null, status: string | null): string[] {
  const index = LEGACY_STAGE_LADDER.findIndex((s) => s.key === stage);
  if (status === "closed" || stage === "closed") return LEGACY_STAGE_LADDER.map((s) => s.key);
  if (index <= 0) return [];
  return LEGACY_STAGE_LADDER.slice(0, index).map((s) => s.key);
}

export interface ProgressSummary {
  participants: number;
  finished: number;
  inProgress: number;
  overdue: number;
  notStarted: number;
}

export function summarise(rows: ParticipantProgress[]): ProgressSummary {
  return {
    participants: rows.length,
    finished: rows.filter((r) => r.finished).length,
    inProgress: rows.filter((r) => !r.finished && r.completedCount > 0).length,
    overdue: rows.filter((r) => r.daysLate > 0).length,
    notStarted: rows.filter((r) => r.completedCount === 0 && !r.finished).length,
  };
}

/** Rows worst-first: latest at the top, then least progress, then by name. */
export function rankForReview(rows: ParticipantProgress[]): ParticipantProgress[] {
  return [...rows].sort(
    (a, b) =>
      b.daysLate - a.daysLate ||
      a.percentComplete - b.percentComplete ||
      a.employeeName.localeCompare(b.employeeName),
  );
}

/**
 * The workbook grid: a fixed set of identifying columns, then one column per
 * stage. Stage columns come from the union of every row's stages so a mixed
 * export (two cycles, different templates) still lines up.
 */
export function progressSheetRows(
  rows: ParticipantProgress[],
): (string | number | null)[][] {
  const stageColumns: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const s of r.stages) {
      if (!seen.has(s.key)) {
        seen.add(s.key);
        stageColumns.push({ key: s.key, label: s.label });
      }
    }
  }

  const header = [
    "Employee",
    "Department",
    "Line manager",
    "Cycle",
    "Current stage",
    "Waiting on",
    "Due",
    "Days late",
    "Stages complete",
    "Progress %",
    ...stageColumns.map((c) => c.label),
  ];

  const body = rows.map((r) => {
    const byKey = new Map(r.stages.map((s) => [s.key, s]));
    return [
      r.employeeName,
      r.department,
      r.managerName,
      r.cycleName,
      r.finished ? "Complete" : r.currentStageLabel,
      r.finished ? null : r.currentStageOwner,
      r.finished ? null : r.currentStageDue,
      r.daysLate || null,
      `${r.completedCount} of ${r.totalCount}`,
      r.percentComplete,
      ...stageColumns.map((c) => {
        const cell = byKey.get(c.key);
        if (!cell) return "n/a"; // stage does not apply to this employee
        if (cell.state === "current" && cell.overdue) return `In progress — ${cell.daysLate}d late`;
        return STAGE_STATE_LABEL[cell.state];
      }),
    ];
  });

  return [header, ...body];
}
