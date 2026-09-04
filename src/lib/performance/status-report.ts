import "server-only";
import { createClient } from "@/lib/supabase/server";
import { applicableStages, stageDueDate, type EmployeeContext } from "@/lib/workflow-engine";
import type { StageRole, WorkflowStage } from "@/types/workflow";
import { STAGE_ROLE_LABEL } from "@/types/workflow";
import {
  legacyCompletedStages,
  legacyStages,
  participantProgress,
  rankForReview,
  summarise,
  type ParticipantProgress,
  type ProgressSummary,
} from "./stage-progress";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** A PostgREST embed arrives as an object, a one-element array, or null. */
function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export interface CycleOption {
  id: string;
  name: string;
  status: string;
  periodStart: string | null;
}

/** Who reviews a participant, so HR can correct it without leaving the page. */
export interface ReviewerAssignment {
  appraisalId: string;
  employeeId: string;
  employeeName: string;
  managerId: string | null;
  managerName: string | null;
  secondLevelId: string | null;
  secondLevelName: string | null;
  /**
   * The line manager on the person's profile — the reporting line, as
   * distinct from who reviews this one appraisal. The two drift apart, and
   * the editor shows both so a mismatch can be fixed where it is noticed.
   */
  profileManagerId: string | null;
  profileManagerName: string | null;
}

export interface Colleague {
  id: string;
  name: string;
}

export interface StatusReport {
  cycles: CycleOption[];
  selectedCycleId: string | null;
  selectedCycleName: string | null;
  rows: ParticipantProgress[];
  summary: ProgressSummary;
  generatedAt: string;
  /**
   * True when the cycle runs no configured workflow, so the report falls back
   * to the built-in stage ladder rather than showing nothing.
   */
  noWorkflow: boolean;
  /**
   * Appraisal rows in this cycle belonging to people who are no longer in the
   * workflow — left behind by a launch under an older roster rule. Excluded
   * from every figure above, and surfaced so they can be cleaned up.
   */
  outsideRoster: number;
  reviewers: Record<string, ReviewerAssignment>;
  colleagues: Colleague[];
}

async function stagesForTemplate(templateId: string | null): Promise<WorkflowStage[]> {
  if (!templateId) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from("cycle_templates")
    .select("config")
    .eq("id", templateId)
    .maybeSingle();
  const config = (data?.config as Record<string, unknown>) ?? {};
  return Array.isArray(config.stages) ? (config.stages as WorkflowStage[]) : [];
}

/**
 * Who counts as management grade, for the stage conditions.
 *
 * There is no grade column on a profile, so the workflow runtime approximates
 * it with "manages at least one person". Mirrored here rather than invented, so
 * the report cannot disagree with the engine that drives the actual flow.
 */
async function managerIdSet(): Promise<Set<string>> {
  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("manager_id").not("manager_id", "is", null);
  return new Set(
    ((data ?? []) as { manager_id: string | null }[])
      .map((r) => r.manager_id)
      .filter((id): id is string => Boolean(id)),
  );
}

function contextFor(
  employeeId: string,
  department: string | null,
  managers: Set<string>,
): EmployeeContext {
  const isManager = managers.has(employeeId);
  return { department, isManager, isManagementGrade: isManager };
}

/**
 * Everyone the performance workflow applies to.
 *
 * The cycle's appraisal rows are not the same set: a cycle launched under an
 * older, looser roster rule left rows behind for people who cannot open the
 * module at all, and reporting or chasing those people is noise at best. The
 * roster is the authority on who is in the workflow, so every count here is
 * taken against it.
 */
async function appraisableIds(): Promise<Set<string>> {
  const supabase = createClient();
  const { data } = await supabase.rpc("appraisable_profiles");
  return new Set(((data ?? []) as { id: string }[]).map((p) => p.id));
}

/** Active people HR can name as a reviewer or a line manager. */
export async function activeColleagues(): Promise<Colleague[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("is_active", true)
    .order("full_name");
  return ((data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map(
    (p) => ({ id: p.id, name: p.full_name || p.email || "—" }),
  );
}

/** Cycles an administrator may report on, newest first. */
export async function getReportableCycles(): Promise<CycleOption[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisal_cycles")
    .select("id, name, status, period_start")
    .order("period_start", { ascending: false, nullsFirst: false });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? "Cycle"),
    status: String(r.status ?? ""),
    periodStart: (r.period_start as string | null) ?? null,
  }));
}

/**
 * Every participant in a cycle and how far through the process they are.
 *
 * The stage a person sits on has always been stored; this is the first thing
 * that reads it across a whole population. Falls back to the cycle's own start
 * date when the template carries none, so due dates are never silently absent.
 */
export async function getStatusReport(cycleId?: string | null): Promise<StatusReport> {
  const cycles = await getReportableCycles();
  const selected =
    (cycleId && cycles.find((c) => c.id === cycleId)?.id) ??
    cycles.find((c) => c.status === "active")?.id ??
    cycles[0]?.id ??
    null;

  const today = todayIso();
  const empty: StatusReport = {
    cycles,
    selectedCycleId: selected,
    selectedCycleName: cycles.find((c) => c.id === selected)?.name ?? null,
    rows: [],
    summary: summarise([]),
    generatedAt: today,
    noWorkflow: false,
    outsideRoster: 0,
    reviewers: {},
    colleagues: [],
  };
  if (!selected) return empty;

  const progress = await getCycleProgress(selected);
  if (!progress) return empty;

  return {
    cycles,
    selectedCycleId: selected,
    selectedCycleName: progress.cycleName,
    rows: rankForReview(progress.rows),
    summary: summarise(progress.rows),
    generatedAt: progress.generatedAt,
    noWorkflow: progress.noWorkflow,
    outsideRoster: progress.outsideRoster,
    reviewers: progress.reviewers,
    colleagues: await activeColleagues(),
  };
}

export interface CycleProgress {
  cycleName: string;
  /** One row per participant, in no particular order. */
  rows: ParticipantProgress[];
  reviewers: Record<string, ReviewerAssignment>;
  /** True when the cycle predates the workflow designer and runs the ladder. */
  noWorkflow: boolean;
  outsideRoster: number;
  generatedAt: string;
}

/**
 * Where everyone in one cycle stands — the single reading of cycle progress.
 *
 * Both the status report and the HR console answer "how far has this cycle
 * got", and until they shared this they answered it from different columns.
 * The console counted `appraisals.status`, which only the legacy actions ever
 * write; an appraisal driven through the configured workflow updates
 * `completed_stages` and leaves `status` at whatever it was launched with. So a
 * cycle could run to its final review with every row on the console still
 * reading "Not started" — not a stale figure, one that would never move.
 */
export async function getCycleProgress(cycleId: string): Promise<CycleProgress | null> {
  const supabase = createClient();
  const today = todayIso();
  const selected = cycleId;

  const { data: cycle } = await supabase
    .from("appraisal_cycles")
    .select("id, name, period_start, goal_setting_deadline, template_id")
    .eq("id", selected)
    .maybeSingle();
  if (!cycle) return null;

  const [stages, managers, appraisable] = await Promise.all([
    stagesForTemplate((cycle.template_id as string | null) ?? null),
    managerIdSet(),
    appraisableIds(),
  ]);
  const cycleName = String(cycle.name ?? "Cycle");
  // A cycle launched before the workflow designer existed has no template. It
  // still runs a real process, so report it against the built-in ladder rather
  // than showing an empty page — with the one date such a cycle does have.
  const usingLegacy = stages.length === 0;
  const effectiveStages = usingLegacy ? legacyStages() : stages;
  const cycleStart = usingLegacy ? null : ((cycle.period_start as string | null) ?? today);
  const dueDates = usingLegacy
    ? { goal_setting: (cycle.goal_setting_deadline as string | null) ?? null }
    : undefined;

  const { data } = await supabase
    .from("appraisals")
    // One string literal, not a concatenation: Supabase infers the row type from
    // the literal, and a concatenated select degrades it to an error type.
    .select(
      "id, employee_id, manager_id, second_level_id, completed_stages, stage, status, employee:profiles!employee_id(full_name, department), manager:profiles!manager_id(full_name), second_level:profiles!second_level_id(full_name)",
    )
    .eq("cycle_id", selected);

  const reviewers: Record<string, ReviewerAssignment> = {};
  const all = (data ?? []) as Record<string, unknown>[];
  const inWorkflow = all.filter((r) => appraisable.has(String(r.employee_id)));

  // The reporting line from the profiles, keyed by employee. Read separately:
  // a second hop through the same relation in one select is more than the
  // literal-typed select will infer.
  const { data: lines } = await supabase
    .from("profiles")
    .select("id, manager_id, manager:profiles!manager_id(full_name)")
    .in(
      "id",
      inWorkflow.map((r) => String(r.employee_id)),
    );
  const reportingLine = new Map(
    ((lines ?? []) as Record<string, unknown>[]).map((p) => [
      String(p.id),
      {
        id: (p.manager_id as string | null) ?? null,
        name: one<{ full_name?: string }>(p.manager as { full_name?: string } | null)?.full_name ?? null,
      },
    ]),
  );

  const rows = inWorkflow.map((r) => {
    const employee = one<{ full_name?: string; department?: string }>(
      r.employee as { full_name?: string; department?: string } | null,
    );
    const manager = one<{ full_name?: string }>(r.manager as { full_name?: string } | null);
    const secondLevel = one<{ full_name?: string }>(
      r.second_level as { full_name?: string } | null,
    );
    const department = employee?.department ?? null;
    const line = reportingLine.get(String(r.employee_id));
    reviewers[String(r.id)] = {
      appraisalId: String(r.id),
      employeeId: String(r.employee_id),
      employeeName: employee?.full_name || "—",
      managerId: (r.manager_id as string | null) ?? null,
      managerName: manager?.full_name ?? null,
      secondLevelId: (r.second_level_id as string | null) ?? null,
      secondLevelName: secondLevel?.full_name ?? null,
      profileManagerId: line?.id ?? null,
      profileManagerName: line?.name ?? null,
    };
    return participantProgress(
      {
        appraisalId: String(r.id),
        employeeName: employee?.full_name || "—",
        department,
        managerName: manager?.full_name ?? null,
        cycleName,
        cycleStart,
        stages: effectiveStages,
        completedStages: usingLegacy
          ? legacyCompletedStages(
              (r.stage as string | null) ?? null,
              (r.status as string | null) ?? null,
            )
          : Array.isArray(r.completed_stages)
            ? (r.completed_stages as string[])
            : [],
        employee: contextFor(String(r.employee_id), department, managers),
        dueDates,
      },
      today,
    );
  });

  return {
    cycleName,
    rows,
    reviewers,
    noWorkflow: usingLegacy,
    outsideRoster: all.length - inWorkflow.length,
    generatedAt: today,
  };
}

// --- Deadlines ---------------------------------------------------------------

export interface DeadlineRow {
  cycleId: string;
  cycleName: string;
  cycleStatus: string;
  stageKey: string;
  stageLabel: string;
  ownerRole: StageRole;
  ownerLabel: string;
  dueDate: string;
  /** True for the cycle-level goal-setting date rather than a template stage. */
  fromCycle: boolean;
  /** Participants still standing behind this stage. */
  pending: number;
  /** Those same people, when the date has already gone. */
  overdue: number;
  daysAway: number;
}

/** The cycle HR can date, with its stages. Null when nothing is datable. */
export interface DatableCycle {
  cycleId: string;
  cycleName: string;
  cycleStart: string;
  stages: WorkflowStage[];
}

export interface DeadlineBoard {
  rows: DeadlineRow[];
  today: string;
  /** The live cycle whose phase dates HR can set. */
  datable: DatableCycle | null;
  /** Active cycles running no workflow — only their goal-setting date applies. */
  cyclesWithoutWorkflow: string[];
}

const DAY_MS = 86_400_000;

/**
 * Every deadline across every live cycle, in date order.
 *
 * Deadlines were only ever visible one at a time, buried in each cycle's own
 * settings. This puts them on one page with the number of people still standing
 * behind each date — which is what decides whether the date matters.
 */
export async function getDeadlineBoard(): Promise<DeadlineBoard> {
  const supabase = createClient();
  const today = todayIso();

  const [{ data: cycles }, managers, appraisable] = await Promise.all([
    supabase
      .from("appraisal_cycles")
      .select("id, name, status, period_start, goal_setting_deadline, template_id")
      .in("status", ["active", "draft"]),
    managerIdSet(),
    appraisableIds(),
  ]);

  const rows: DeadlineRow[] = [];
  const cyclesWithoutWorkflow: string[] = [];
  let datable: DatableCycle | null = null;

  for (const c of (cycles ?? []) as Record<string, unknown>[]) {
    const cycleId = String(c.id);
    const cycleName = String(c.name ?? "Cycle");
    const stages = await stagesForTemplate((c.template_id as string | null) ?? null);
    const goalDeadline = (c.goal_setting_deadline as string | null) ?? null;

    // A cycle with no template still has the one deadline everybody works to.
    // Reporting nothing for it was the reason deadlines felt invisible.
    if (!stages.length) {
      cyclesWithoutWorkflow.push(cycleName);
      if (goalDeadline) {
        const { data: waiting } = await supabase
          .from("appraisals")
          .select("employee_id")
          .eq("cycle_id", cycleId)
          .eq("stage", "goal_setting");
        // Only people actually in the workflow count towards a deadline.
        const pending = ((waiting ?? []) as { employee_id: string }[]).filter((w) =>
          appraisable.has(w.employee_id),
        ).length;
        rows.push({
          cycleId,
          cycleName,
          cycleStatus: String(c.status ?? ""),
          stageKey: "goal_setting",
          stageLabel: "Goal setting",
          ownerRole: "employee",
          ownerLabel: STAGE_ROLE_LABEL.employee,
          dueDate: goalDeadline,
          fromCycle: true,
          pending,
          overdue: goalDeadline < today ? pending : 0,
          daysAway: Math.round(
            (new Date(`${goalDeadline}T00:00:00Z`).getTime() -
              new Date(`${today}T00:00:00Z`).getTime()) /
              DAY_MS,
          ),
        });
      }
      continue;
    }
    const cycleStart = (c.period_start as string | null) ?? today;
    // The active cycle's dates are the ones worth editing; a draft would move
    // the same template underneath the live one.
    if (!datable && c.status === "active" && c.period_start) {
      datable = { cycleId, cycleName, cycleStart, stages };
    }

    const { data: appraisals } = await supabase
      .from("appraisals")
      .select("id, employee_id, completed_stages, employee:profiles!employee_id(department)")
      .eq("cycle_id", cycleId);

    // How many people are still standing behind each stage.
    const pendingByStage = new Map<string, number>();
    for (const a of (appraisals ?? []) as Record<string, unknown>[]) {
      if (!appraisable.has(String(a.employee_id))) continue;
      const employee = one<{ department?: string }>(a.employee as { department?: string } | null);
      const done = new Set(
        Array.isArray(a.completed_stages) ? (a.completed_stages as string[]) : [],
      );
      const mine = applicableStages(
        stages,
        contextFor(String(a.employee_id), employee?.department ?? null, managers),
      );
      for (const s of mine) {
        if (!done.has(s.key)) pendingByStage.set(s.key, (pendingByStage.get(s.key) ?? 0) + 1);
      }
    }

    for (const s of stages) {
      const dueDate = stageDueDate(s, cycleStart);
      const pending = pendingByStage.get(s.key) ?? 0;
      rows.push({
        cycleId,
        cycleName,
        cycleStatus: String(c.status ?? ""),
        stageKey: s.key,
        stageLabel: s.label,
        ownerRole: s.responsibleRole,
        ownerLabel: STAGE_ROLE_LABEL[s.responsibleRole],
        dueDate,
        fromCycle: false,
        pending,
        overdue: dueDate < today ? pending : 0,
        daysAway: Math.round(
          (new Date(`${dueDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
            DAY_MS,
        ),
      });
    }
  }

  rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.cycleName.localeCompare(b.cycleName));
  return { rows, today, datable, cyclesWithoutWorkflow };
}
