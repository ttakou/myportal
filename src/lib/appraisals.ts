import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/row-helpers";
import {
  managerActionNeeded,
  type Appraisal,
  type AppraisalCompetency,
  type AppraisalCycle,
  type AppraisalEvent,
  type AppraisalGoal,
  type AppraisalKeyResult,
  type CalibrationAdjustment,
  type CalibrationRosterRow,
  type Colleague,
  type DepartmentObjective,
  type DirectReport,
  type GoalRater,
  type RaterAssignment,
} from "@/types/appraisal";

const APPRAISAL_SELECT =
  "id, cycle_id, employee_id, manager_id, second_level_id, stage, status, overall_rating," +
  " final_score, rating_label, calibration_gate, rating_released_at," +
  " employee_summary, manager_summary, discussion_date, discussion_notes," +
  " acknowledged_at, employee_agreed, employee_ack_comment," +
  " cycle:appraisal_cycles(name)," +
  " employee:profiles!employee_id(full_name, employee_type)," +
  " manager:profiles!manager_id(full_name)," +
  " second_level:profiles!second_level_id(full_name)";

/** A Supabase relationship comes back as a single row or an array of rows. */
type Joined<T> = T | T[] | null;

/** Shape of an `appraisals` row selected with APPRAISAL_SELECT. */
interface RawAppraisalRow {
  id: string;
  cycle_id: string;
  cycle?: Joined<{ name?: string }>;
  employee_id: string;
  employee?: Joined<{ full_name?: string }>;
  manager_id?: string | null;
  manager?: Joined<{ full_name?: string }>;
  second_level_id?: string | null;
  second_level?: Joined<{ full_name?: string }>;
  stage: Appraisal["stage"];
  status: Appraisal["status"];
  overall_rating?: number | null;
  final_score?: number | null;
  rating_label?: string | null;
  calibration_gate?: Appraisal["calibration_gate"] | null;
  rating_released_at?: string | null;
  employee_summary?: string | null;
  manager_summary?: string | null;
  discussion_date?: string | null;
  discussion_notes?: string | null;
  acknowledged_at?: string | null;
  employee_agreed?: boolean | null;
  employee_ack_comment?: string | null;
}

function mapAppraisal(r: RawAppraisalRow): Appraisal {
  return {
    id: r.id,
    cycle_id: r.cycle_id,
    cycle_name: one<{ name?: string }>(r.cycle)?.name ?? null,
    employee_id: r.employee_id,
    employee_name: one<{ full_name?: string }>(r.employee)?.full_name ?? null,
    manager_id: r.manager_id ?? null,
    manager_name: one<{ full_name?: string }>(r.manager)?.full_name ?? null,
    second_level_id: r.second_level_id ?? null,
    second_level_name: one<{ full_name?: string }>(r.second_level)?.full_name ?? null,
    stage: r.stage,
    status: r.status,
    overall_rating: r.overall_rating ?? null,
    final_score: r.final_score ?? null,
    rating_label: r.rating_label ?? null,
    calibration_gate: r.calibration_gate ?? "provisional",
    rating_released_at: r.rating_released_at ?? null,
    employee_summary: r.employee_summary ?? null,
    manager_summary: r.manager_summary ?? null,
    discussion_date: r.discussion_date ?? null,
    discussion_notes: r.discussion_notes ?? null,
    acknowledged_at: r.acknowledged_at ?? null,
    employee_agreed: r.employee_agreed ?? null,
    employee_ack_comment: r.employee_ack_comment ?? null,
    appeal: null,
    competencies: [],
    development_plan: [],
    goals: [],
    events: [],
  };
}

/** All competencies for the HR framework editor. Request-cached: the framework
 *  is near-static and several panels read it within one render. */
export const getCompetencies = cache(async (): Promise<AppraisalCompetency[]> => {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisal_competencies")
    .select("id, name, description, is_active, weight")
    .order("name");
  return (data ?? []) as AppraisalCompetency[];
});

/** The tenant's active cycle (or the most recent one). */
export async function getActiveCycle(): Promise<AppraisalCycle | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisal_cycles")
    .select(
      "id, name, year, period_start, period_end, goal_setting_deadline, status," +
        " weight_okr, weight_competency, weight_development, require_second_level, rating_bands, created_at",
    )
    .order("status", { ascending: true }) // 'active' sorts before 'draft'/'closed'? no — filter instead
    .order("year", { ascending: false })
    .limit(20);
  const rows = (data ?? []) as unknown as AppraisalCycle[];
  return rows.find((c) => c.status === "active") ?? rows[0] ?? null;
}

/** All cycles for the HR console. Request-cached: the cycle list is near-static
 *  and read by the year switcher, the page and several panels in one render. */
export const getCycles = cache(async (): Promise<AppraisalCycle[]> => {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisal_cycles")
    .select(
      "id, name, year, period_start, period_end, goal_setting_deadline, status," +
        " weight_okr, weight_competency, weight_development, require_second_level, rating_bands, created_at",
    )
    .order("year", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as AppraisalCycle[];
});

export interface AppraisalHistoryEntry {
  cycle_id: string;
  cycle_name: string | null;
  year: number;
  status: string;
  overall_rating: number | null;
  rating_label: string | null;
}

/** The signed-in employee's appraisals across all cycles, oldest→newest. */
export async function getMyAppraisalHistory(): Promise<AppraisalHistoryEntry[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("appraisals")
    .select("cycle_id, status, overall_rating, rating_label, cycle:appraisal_cycles(name, year)")
    .eq("employee_id", user.id);
  return ((data ?? []) as Record<string, any>[])
    .map((r) => {
      const cyc = one<{ name?: string; year?: number }>(r.cycle);
      return {
        cycle_id: r.cycle_id,
        cycle_name: cyc?.name ?? null,
        year: cyc?.year ?? 0,
        status: r.status,
        overall_rating: r.overall_rating ?? null,
        rating_label: r.rating_label ?? null,
      };
    })
    .sort((a, b) => a.year - b.year);
}

/** The signed-in employee's appraisal for a cycle, with goals + events. */
export async function getMyAppraisal(cycleId: string): Promise<Appraisal | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("appraisals")
    .select(APPRAISAL_SELECT)
    .eq("cycle_id", cycleId)
    .eq("employee_id", user.id)
    .maybeSingle();
  if (!data) return null;
  const appraisal = mapAppraisal(data as unknown as RawAppraisalRow);
  // In a gate cycle, surface the year's goals (set in the Annual cycle) read-only.
  const source = await goalSourceCycle(cycleId);
  let goalsApId: string | undefined;
  if (source) {
    const { data: baseAp } = await supabase
      .from("appraisals")
      .select("id")
      .eq("cycle_id", source.id)
      .eq("employee_id", user.id)
      .maybeSingle();
    if (baseAp) {
      goalsApId = baseAp.id as string;
      appraisal.goalsReadOnly = true;
      appraisal.goalsSourceName = source.name;
    }
  }
  await hydrate(appraisal, goalsApId);
  // Employee view: overlay who is reviewing each goal + whether they responded,
  // but never the rating or comment (those are confidential to the manager).
  const { data: er } = await supabase.rpc("goal_raters_for_employee", {
    p_appraisal: goalsApId ?? appraisal.id,
  });
  const byGoal = new Map<string, GoalRater[]>();
  for (const r of (er ?? []) as Record<string, any>[]) {
    const arr = byGoal.get(r.goal_id) ?? [];
    arr.push({
      id: r.id,
      rater_id: r.rater_id,
      rater_name: r.rater_name ?? null,
      rating: null,
      comment: null,
      status: r.status,
    });
    byGoal.set(r.goal_id, arr);
  }
  for (const g of appraisal.goals) g.raters = byGoal.get(g.id) ?? [];
  return appraisal;
}

/** Goals the signed-in user has been asked to review (as a stakeholder rater). */
export async function getMyRaterAssignments(): Promise<RaterAssignment[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("my_goal_rater_assignments");
  return (data ?? []) as RaterAssignment[];
}

/** Active people in the tenant, for the stakeholder-reviewer picker.
 *  Request-cached: shared by the manager and employee panels in one render. */
export const getTenantColleagues = cache(async (): Promise<Colleague[]> => {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, department")
    .eq("is_active", true)
    .order("full_name")
    .limit(500);
  return (data ?? []) as Colleague[];
});

/** Department objectives the signed-in employee can align goals to: their
 *  department (or company-wide), scoped to the cycle (or evergreen), active. */
export async function getDepartmentObjectivesForMe(
  cycleId?: string | null,
): Promise<DepartmentObjective[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: me } = await supabase
    .from("profiles")
    .select("department")
    .eq("id", user.id)
    .maybeSingle();
  const dept = (me?.department as string | null) ?? null;
  let q = supabase
    .from("appraisal_department_objectives")
    .select("id, department, title, description, is_active, cycle_id, cycle:appraisal_cycles(name)")
    .eq("is_active", true)
    .order("title");
  q = dept ? q.or(`department.is.null,department.eq.${dept}`) : q.is("department", null);
  if (cycleId) q = q.or(`cycle_id.is.null,cycle_id.eq.${cycleId}`);
  else q = q.is("cycle_id", null);
  const { data } = await q;
  return ((data ?? []) as Record<string, any>[]).map((r) => ({
    id: r.id,
    department: r.department ?? null,
    title: r.title,
    description: r.description ?? null,
    is_active: r.is_active,
    cycle_id: r.cycle_id ?? null,
    cycle_name: one<{ name?: string }>(r.cycle)?.name ?? null,
  }));
}

/** All department objectives for the HR management UI. Request-cached. */
export const getDepartmentObjectives = cache(async (): Promise<DepartmentObjective[]> => {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisal_department_objectives")
    .select("id, department, title, description, is_active, cycle_id, cycle:appraisal_cycles(name)")
    .order("department", { nullsFirst: true })
    .order("title");
  return ((data ?? []) as Record<string, any>[]).map((r) => ({
    id: r.id,
    department: r.department ?? null,
    title: r.title,
    description: r.description ?? null,
    is_active: r.is_active,
    cycle_id: r.cycle_id ?? null,
    cycle_name: one<{ name?: string }>(r.cycle)?.name ?? null,
  }));
});

/**
 * The signed-in manager's direct line — their direct reports (from the
 * reporting hierarchy on `profiles.manager_id`) overlaid with each report's
 * appraisal state for the given cycle. Returns an empty list for non-managers.
 * This is intentionally lightweight (no goal/event hydration) so it can power
 * the performance dashboard at a glance; the manager acts on the full record
 * over on the appraisals page.
 */
/** True when the signed-in user is a line manager (has at least one direct
 *  report via profiles.manager_id). Cached per request — cheap, indexed count. */
export const hasDirectReports = cache(async (): Promise<boolean> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("manager_id", user.id)
    .eq("is_active", true);
  return (count ?? 0) > 0;
});

export async function getMyDirectLine(cycleId: string | null): Promise<DirectReport[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: reports } = await supabase
    .from("profiles")
    .select("id, full_name, job_title, avatar_url")
    .eq("manager_id", user.id)
    .eq("is_active", true)
    .order("full_name");
  const reportRows = (reports ?? []) as Record<string, any>[];
  if (reportRows.length === 0) return [];

  // Overlay each report's appraisal for the active cycle (if one is running).
  const byEmployee = new Map<
    string,
    { id: string; stage: Appraisal["stage"]; status: Appraisal["status"] }
  >();
  if (cycleId) {
    const { data: aps } = await supabase
      .from("appraisals")
      .select("id, employee_id, stage, status")
      .eq("cycle_id", cycleId)
      .eq("manager_id", user.id);
    for (const a of (aps ?? []) as Record<string, any>[])
      byEmployee.set(a.employee_id, { id: a.id, stage: a.stage, status: a.status });
  }

  return reportRows.map((r) => {
    const ap = byEmployee.get(r.id);
    return {
      profile_id: r.id,
      name: (r.full_name as string) ?? "—",
      job_title: (r.job_title as string | null) ?? null,
      avatar_url: (r.avatar_url as string | null) ?? null,
      appraisal_id: ap?.id ?? null,
      stage: ap?.stage ?? null,
      status: ap?.status ?? null,
      needs_action: ap ? managerActionNeeded(ap.stage, ap.status) : false,
    };
  });
}

/** Appraisals the signed-in manager owns (their direct reports). */
export async function getTeamAppraisals(cycleId: string): Promise<Appraisal[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  // Include appraisals of managers who nominated me as their delegate, so their
  // team's reviews don't stall while they're unavailable.
  const { data: delegators } = await supabase
    .from("profiles")
    .select("id")
    .eq("appraisal_delegate_id", user.id);
  const managerIds = [user.id, ...((delegators ?? []) as { id: string }[]).map((d) => d.id)];
  const { data } = await supabase
    .from("appraisals")
    .select(APPRAISAL_SELECT)
    .eq("cycle_id", cycleId)
    .in("manager_id", managerIds)
    .order("status");
  const list = (data ?? []).map((r) => mapAppraisal(r as unknown as RawAppraisalRow));
  await hydrateWithYearGoals(list, cycleId);
  return list;
}

/** The colleague the signed-in manager has nominated as their appraisal delegate. */
export async function getMyAppraisalDelegate(): Promise<{ id: string; name: string | null } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select(
      "appraisal_delegate_id, delegate:profiles!profiles_appraisal_delegate_id_fkey(full_name)",
    )
    .eq("id", user.id)
    .maybeSingle();
  const id = (data?.appraisal_delegate_id as string | null) ?? null;
  if (!id) return null;
  const raw = (data as { delegate?: { full_name?: string } | { full_name?: string }[] | null })
    .delegate;
  const d = one<{ full_name?: string }>(raw ?? null);
  return { id, name: d?.full_name ?? null };
}

/** Appraisals awaiting the signed-in second-level approver. */
export async function getSecondLevelQueue(cycleId: string): Promise<Appraisal[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("appraisals")
    .select(APPRAISAL_SELECT)
    .eq("cycle_id", cycleId)
    .eq("second_level_id", user.id)
    .eq("status", "pending_second_level");
  const list = (data ?? []).map((r) => mapAppraisal(r as unknown as RawAppraisalRow));
  await hydrateWithYearGoals(list, cycleId);
  return list;
}

/** Every appraisal in a cycle (HR monitoring; RLS limits to HR/admins). */
export async function getCycleAppraisals(cycleId: string): Promise<Appraisal[]> {
  const supabase = createClient();
  const [{ data }, { data: appraisable }] = await Promise.all([
    supabase.from("appraisals").select(APPRAISAL_SELECT).eq("cycle_id", cycleId).order("status"),
    // Who belongs on the roster: staff (employee/expat) who can actually access
    // the Performance module (a performance-view access role, or unrestricted).
    supabase.rpc("appraisable_profiles"),
  ]);
  const ids = new Set(((appraisable ?? []) as { id: string }[]).map((p) => p.id));
  const staff = (data ?? []).filter((r) =>
    ids.has((r as unknown as { employee_id: string }).employee_id),
  );
  const list = staff.map((r) => mapAppraisal(r as unknown as RawAppraisalRow));
  // Hydrate the rows HR acts on so the queue shows the appeal reason and the
  // (confidential) stakeholder feedback during validation.
  await hydrateWithYearGoals(
    list.filter((a) => a.status === "under_appeal" || a.status === "pending_hr_review"),
    cycleId,
  );
  return list;
}

export interface CalibrationData {
  total: number;
  averageOverall: number | null;
  buckets: { label: string; count: number }[];
  byDept: { department: string; count: number; avg: number }[];
}

/** Rating distribution for a cycle (HR calibration view). RLS limits rows to HR. */
export async function getCalibration(cycleId: string): Promise<CalibrationData> {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisals")
    .select("overall_rating, employee:profiles!employee_id(department)")
    .eq("cycle_id", cycleId)
    .not("overall_rating", "is", null);

  const rows = (data ?? []) as Record<string, any>[];
  const bucketDefs = [
    { label: "1 – Needs improvement", min: 0, max: 1.5 },
    { label: "2 – Below expectations", min: 1.5, max: 2.5 },
    { label: "3 – Meets expectations", min: 2.5, max: 3.5 },
    { label: "4 – Exceeds", min: 3.5, max: 4.5 },
    { label: "5 – Outstanding", min: 4.5, max: 5.01 },
  ];
  const buckets = bucketDefs.map((b) => ({ label: b.label, count: 0 }));
  const dept = new Map<string, { count: number; sum: number }>();
  let sum = 0;
  for (const r of rows) {
    const rating = Number(r.overall_rating);
    sum += rating;
    const bi = bucketDefs.findIndex((b) => rating >= b.min && rating < b.max);
    if (bi >= 0) buckets[bi].count += 1;
    const d = one<{ department?: string }>(r.employee)?.department || "Unassigned";
    const cur = dept.get(d) ?? { count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += rating;
    dept.set(d, cur);
  }
  return {
    total: rows.length,
    averageOverall: rows.length ? Math.round((sum / rows.length) * 100) / 100 : null,
    buckets,
    byDept: [...dept.entries()]
      .map(([department, v]) => ({
        department,
        count: v.count,
        avg: Math.round((v.sum / v.count) * 100) / 100,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Appraisals with a computed score, for the calibration committee (HR only). */
export async function getCalibrationRoster(cycleId: string): Promise<CalibrationRosterRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisals")
    .select(
      "id, overall_rating, final_score, rating_label, status," +
        " employee:profiles!employee_id(full_name, department)",
    )
    .eq("cycle_id", cycleId)
    .not("final_score", "is", null)
    .order("final_score", { ascending: false });
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const emp = one<{ full_name?: string; department?: string }>(r.employee);
    return {
      id: r.id,
      employee_name: emp?.full_name ?? null,
      department: emp?.department ?? null,
      overall_rating: r.overall_rating ?? null,
      final_score: r.final_score ?? null,
      rating_label: r.rating_label ?? null,
      status: r.status,
    };
  });
}

/** Calibration adjustment log for a cycle (HR/committee only via RLS). */
export async function getCalibrationAdjustments(cycleId: string): Promise<CalibrationAdjustment[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisal_calibration_adjustments")
    .select(
      "id, appraisal_id, previous_score, previous_label, new_score, new_label, reason, created_at," +
        " adjuster:profiles!adjusted_by(full_name)," +
        " appraisal:appraisals(employee:profiles!employee_id(full_name))",
    )
    .eq("cycle_id", cycleId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const ap = one<{ employee?: { full_name?: string } | { full_name?: string }[] }>(r.appraisal);
    return {
      id: r.id,
      appraisal_id: r.appraisal_id,
      employee_name: one<{ full_name?: string }>(ap?.employee)?.full_name ?? null,
      previous_score: r.previous_score ?? null,
      previous_label: r.previous_label ?? null,
      new_score: r.new_score ?? null,
      new_label: r.new_label ?? null,
      reason: r.reason ?? null,
      adjusted_by_name: one<{ full_name?: string }>(r.adjuster)?.full_name ?? null,
      created_at: r.created_at,
    };
  });
}

/** One appraisal with goals + event history (for manager/HR detail). */
export async function getAppraisal(id: string): Promise<Appraisal | null> {
  const supabase = createClient();
  const { data } = await supabase.from("appraisals").select(APPRAISAL_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const appraisal = mapAppraisal(data as unknown as RawAppraisalRow);
  await hydrate(appraisal);
  return appraisal;
}

/**
 * For a gate cycle (mid-year / final / calibration — named "… - <gate>"), find
 * the year's Annual source cycle (same year, name without a gate suffix) whose
 * goals should be surfaced. Returns null when the cycle is itself the Annual
 * source, or no distinct Annual cycle exists for the year (so single-cycle
 * tenants are entirely unaffected).
 */
async function goalSourceCycle(
  cycleId: string,
): Promise<{ id: string; name: string } | null> {
  const supabase = createClient();
  const { data: cyc } = await supabase
    .from("appraisal_cycles")
    .select("id, name, year")
    .eq("id", cycleId)
    .maybeSingle();
  if (!cyc || !/ - /.test(cyc.name as string)) return null; // not a gate
  const { data: peers } = await supabase
    .from("appraisal_cycles")
    .select("id, name")
    .eq("year", cyc.year as number);
  const base = ((peers ?? []) as { id: string; name: string }[]).find(
    (p) => p.id !== cyc.id && !/ - /.test(p.name),
  );
  return base ? { id: base.id, name: base.name } : null;
}

/**
 * Hydrate a list of appraisals, surfacing the year's goals (from the Annual
 * cycle) read-only when `cycleId` is a gate cycle. No-op for non-gate cycles.
 */
async function hydrateWithYearGoals(list: Appraisal[], cycleId: string): Promise<void> {
  const source = list.length ? await goalSourceCycle(cycleId) : null;
  let baseByEmployee: Map<string, string> | null = null;
  if (source) {
    const supabase = createClient();
    const { data: baseAps } = await supabase
      .from("appraisals")
      .select("id, employee_id")
      .eq("cycle_id", source.id)
      .in(
        "employee_id",
        list.map((a) => a.employee_id),
      );
    baseByEmployee = new Map(
      ((baseAps ?? []) as { id: string; employee_id: string }[]).map((a) => [
        a.employee_id,
        a.id,
      ]),
    );
  }
  await Promise.all(
    list.map((ap) => {
      const gid = baseByEmployee?.get(ap.employee_id);
      if (gid && source) {
        ap.goalsReadOnly = true;
        ap.goalsSourceName = source.name;
      }
      return hydrate(ap, gid);
    }),
  );
}

/**
 * Load goals + events onto an appraisal. When `goalsAppraisalId` is given, the
 * goals/key-results/witnesses are read from THAT appraisal instead (used to
 * surface a year's goals — set in its Annual cycle — across the year's gate
 * cycles). Events stay with the appraisal itself.
 */
async function hydrate(appraisal: Appraisal, goalsAppraisalId?: string): Promise<void> {
  const supabase = createClient();
  const gid = goalsAppraisalId ?? appraisal.id;
  const [{ data: goals }, { data: events }] = await Promise.all([
    supabase
      .from("appraisal_goals")
      .select(
        "id, title, description, weight, deadline, success_indicator, alignment, evidence_required, kind," +
          " employee_progress, employee_self_rating, employee_comment, manager_rating, manager_comment, at_risk, status",
      )
      .eq("appraisal_id", gid)
      .order("created_at"),
    supabase
      .from("appraisal_events")
      .select("id, stage, action, comment, created_at, actor:profiles!actor_id(full_name)")
      .eq("appraisal_id", appraisal.id)
      .order("created_at", { ascending: false }),
  ]);
  const goalsList = ((goals ?? []) as unknown as AppraisalGoal[]).map((g) => ({
    ...g,
    key_results: [] as AppraisalKeyResult[],
    raters: [] as GoalRater[],
  }));
  const { data: krs } = await supabase
    .from("appraisal_key_results")
    .select("id, goal_id, title, target, current_value, unit, progress")
    .eq("appraisal_id", gid)
    .order("created_at");
  const byGoal = new Map<string, AppraisalKeyResult[]>();
  for (const k of (krs ?? []) as Record<string, any>[]) {
    const arr = byGoal.get(k.goal_id) ?? [];
    arr.push({
      id: k.id,
      title: k.title,
      target: k.target ?? null,
      current_value: k.current_value ?? null,
      unit: k.unit ?? null,
      progress: k.progress ?? 0,
    });
    byGoal.set(k.goal_id, arr);
  }
  for (const g of goalsList) g.key_results = byGoal.get(g.id) ?? [];

  // Stakeholder reviewers. RLS returns full rows (incl. rating/comment) only to
  // evaluators (manager/second-level/HR/admin); for the employee's own view this
  // query returns nothing, and getMyAppraisal overlays a redacted list instead.
  const { data: raterRows } = await supabase
    .from("appraisal_goal_raters")
    .select("id, goal_id, rater_id, rating, comment, status, rater:profiles!rater_id(full_name)")
    .eq("appraisal_id", gid);
  const ratersByGoal = new Map<string, GoalRater[]>();
  for (const r of (raterRows ?? []) as Record<string, any>[]) {
    const arr = ratersByGoal.get(r.goal_id) ?? [];
    arr.push({
      id: r.id,
      rater_id: r.rater_id,
      rater_name: one<{ full_name?: string }>(r.rater)?.full_name ?? null,
      rating: r.rating ?? null,
      comment: r.comment ?? null,
      status: r.status,
    });
    ratersByGoal.set(r.goal_id, arr);
  }
  for (const g of goalsList) g.raters = ratersByGoal.get(g.id) ?? [];
  appraisal.goals = goalsList;

  // The IDP, like goals, belongs to the year — surface the Annual cycle's plan
  // across the gate cycles (read-only there) by loading it from `gid`.
  const { data: dev } = await supabase
    .from("appraisal_development_plans")
    .select("id, area, action, target_date, status")
    .eq("appraisal_id", gid)
    .order("created_at");
  appraisal.development_plan = (dev ?? []) as Appraisal["development_plan"];
  const { data: appeal } = await supabase
    .from("appraisal_appeals")
    .select("id, reason, status, decision, created_at, resolved_at")
    .eq("appraisal_id", appraisal.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  appraisal.appeal = (appeal as Appraisal["appeal"]) ?? null;

  const [{ data: comps }, { data: ratings }] = await Promise.all([
    supabase
      .from("appraisal_competencies")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("appraisal_competency_ratings")
      .select("competency_id, employee_rating, manager_rating, manager_comment")
      .eq("appraisal_id", appraisal.id),
  ]);
  const rmap = new Map(((ratings ?? []) as Record<string, any>[]).map((r) => [r.competency_id, r]));
  appraisal.competencies = ((comps ?? []) as Record<string, any>[]).map((c) => {
    const r = rmap.get(c.id);
    return {
      competency_id: c.id as string,
      name: c.name as string,
      employee_rating: r?.employee_rating ?? null,
      manager_rating: r?.manager_rating ?? null,
      manager_comment: r?.manager_comment ?? null,
    };
  });
  appraisal.events = ((events ?? []) as Record<string, any>[]).map(
    (e): AppraisalEvent => ({
      id: e.id,
      actor_name: one<{ full_name?: string }>(e.actor)?.full_name ?? null,
      stage: e.stage ?? null,
      action: e.action,
      comment: e.comment ?? null,
      created_at: e.created_at,
    }),
  );
}
