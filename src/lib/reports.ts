import "server-only";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/row-helpers";

/** Distinct, non-empty departments in the tenant — for the report filter bar. */
export async function getDepartments(): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("department")
    .not("department", "is", null)
    .order("department");
  const set = new Set<string>();
  for (const r of (data ?? []) as { department: string | null }[]) {
    if (r.department) set.add(r.department);
  }
  return [...set];
}

export interface ReportPerson {
  id: string;
  name: string;
}

/** Active people in the tenant — for the per-person report filter. */
export async function getReportPeople(): Promise<ReportPerson[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name");
  return ((data ?? []) as { id: string; full_name: string | null }[]).map((p) => ({
    id: p.id,
    name: p.full_name || "—",
  }));
}

// --- Out-of-town travel & expense -----------------------------------------

export interface TravelExpenseRow {
  trip_id: string;
  traveller: string | null;
  department: string | null;
  destination: string;
  purpose: string | null;
  depart_date: string;
  return_date: string | null;
  status: string;
  estimated: number;
  actual: number;
}

export interface TravelExpenseReport {
  rows: TravelExpenseRow[];
  summary: { trips: number; estimated: number; actual: number; variance: number };
  byDept: { department: string; trips: number; estimated: number; actual: number }[];
}

export interface TravelExpenseFilters {
  from: string;
  to: string;
  department: string | null;
  userId: string | null;
}

/**
 * Out-of-town travel spend: estimated vs actual (summed trip_expenses) per trip,
 * filtered by departure-date period, department and/or traveller, with a
 * per-department roll-up. RLS scopes rows to the tenant.
 */
export async function getTravelExpenseReport(
  f: TravelExpenseFilters,
): Promise<TravelExpenseReport> {
  const supabase = createClient();
  let q = supabase
    .from("out_of_town_trips")
    .select(
      "id, destination, purpose, depart_date, return_date, status, estimated_cost, requester_id," +
        " requester:profiles!out_of_town_trips_requester_id_fkey(full_name, department)",
    )
    .gte("depart_date", f.from)
    .lte("depart_date", f.to);
  if (f.userId) q = q.eq("requester_id", f.userId);
  const { data: trips } = await q.order("depart_date", { ascending: false });
  const tripRows = (trips ?? []) as Record<string, any>[];

  // Actual spend per trip from the expense lines.
  const actualByTrip = new Map<string, number>();
  const ids = tripRows.map((t) => t.id as string);
  if (ids.length) {
    const { data: exp } = await supabase
      .from("trip_expenses")
      .select("trip_id, amount")
      .in("trip_id", ids);
    for (const e of (exp ?? []) as { trip_id: string; amount: number }[]) {
      actualByTrip.set(e.trip_id, (actualByTrip.get(e.trip_id) ?? 0) + Number(e.amount));
    }
  }

  const rows: TravelExpenseRow[] = [];
  for (const t of tripRows) {
    const prof = one<{ full_name?: string; department?: string }>(t.requester);
    const department = prof?.department ?? null;
    if (f.department && department !== f.department) continue;
    rows.push({
      trip_id: t.id,
      traveller: prof?.full_name ?? null,
      department,
      destination: t.destination,
      purpose: t.purpose ?? null,
      depart_date: t.depart_date,
      return_date: t.return_date ?? null,
      status: t.status,
      estimated: Number(t.estimated_cost ?? 0),
      actual: actualByTrip.get(t.id) ?? 0,
    });
  }

  const deptMap = new Map<string, { trips: number; est: number; act: number }>();
  for (const r of rows) {
    const d = r.department || "Unassigned";
    const cur = deptMap.get(d) ?? { trips: 0, est: 0, act: 0 };
    cur.trips += 1;
    cur.est += r.estimated;
    cur.act += r.actual;
    deptMap.set(d, cur);
  }
  const byDept = [...deptMap.entries()]
    .map(([department, v]) => ({ department, trips: v.trips, estimated: v.est, actual: v.act }))
    .sort((a, b) => b.actual - a.actual);

  const estimated = rows.reduce((s, r) => s + r.estimated, 0);
  const actual = rows.reduce((s, r) => s + r.actual, 0);
  return {
    rows,
    summary: { trips: rows.length, estimated, actual, variance: actual - estimated },
    byDept,
  };
}

// --- Transportation requests & SLA ----------------------------------------

export interface TransportReport {
  summary: {
    total: number;
    completed: number;
    cancelled: number;
    active: number;
    overdue: number;
    completionRate: number;
  };
  byStatus: { status: string; count: number }[];
  byDept: { department: string; count: number }[];
  byTaskType: { taskType: string; count: number }[];
}

export interface TransportReportFilters {
  from: string;
  to: string;
  department: string | null;
}

const TRANSPORT_ACTIVE = new Set(["pending", "assigned", "in_progress"]);

/**
 * Transportation requests over a period (by departure time): completion vs
 * cancellation, active backlog and overdue (still pending/assigned past the
 * departure time), with status, department and task-type breakdowns. Filter by
 * department. RLS scopes rows to the tenant.
 */
export async function getTransportReport(f: TransportReportFilters): Promise<TransportReport> {
  const supabase = createClient();
  const { data } = await supabase
    .from("transport_requests")
    .select(
      "status, task_type, depart_at," +
        " requester:profiles!transport_requests_requester_id_fkey(department)",
    )
    .gte("depart_at", `${f.from}T00:00:00`)
    .lte("depart_at", `${f.to}T23:59:59`);

  const now = new Date().toISOString();
  let completed = 0;
  let cancelled = 0;
  let active = 0;
  let overdue = 0;
  const statusMap = new Map<string, number>();
  const deptMap = new Map<string, number>();
  const taskMap = new Map<string, number>();

  for (const r of (data ?? []) as Record<string, any>[]) {
    const department = one<{ department?: string }>(r.requester)?.department ?? null;
    if (f.department && department !== f.department) continue;

    if (r.status === "completed") completed += 1;
    else if (r.status === "cancelled") cancelled += 1;
    else if (TRANSPORT_ACTIVE.has(r.status)) {
      active += 1;
      if ((r.status === "pending" || r.status === "assigned") && r.depart_at < now) overdue += 1;
    }

    statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + 1);
    deptMap.set(department || "Unassigned", (deptMap.get(department || "Unassigned") ?? 0) + 1);
    taskMap.set(r.task_type, (taskMap.get(r.task_type) ?? 0) + 1);
  }

  const total = [...statusMap.values()].reduce((s, n) => s + n, 0);
  const decided = total - cancelled;
  return {
    summary: {
      total,
      completed,
      cancelled,
      active,
      overdue,
      completionRate: decided ? Math.round((completed / decided) * 100) : 0,
    },
    byStatus: [...statusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    byDept: [...deptMap.entries()]
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count),
    byTaskType: [...taskMap.entries()]
      .map(([taskType, count]) => ({ taskType, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// --- Canteen consumption & no-show ----------------------------------------
export interface CanteenReport {
  summary: { served: number; noShow: number; cancelled: number; pending: number; noShowRate: number };
  byDept: { department: string; served: number; noShow: number }[];
  byMeal: { meal: string; served: number; noShow: number }[];
  byPerson: { name: string | null; department: string | null; served: number; noShow: number }[];
}

export interface CanteenReportFilters {
  from: string;
  to: string;
  department: string | null;
}

/**
 * Canteen consumption & no-show over a period: served vs no-show (booked, past
 * service date, never served) vs cancelled, with no-show rate, and breakdowns
 * by department and meal period. Filter by department. RLS scopes to the tenant.
 */
export async function getCanteenReport(f: CanteenReportFilters): Promise<CanteenReport> {
  const supabase = createClient();
  const { data } = await supabase
    .from("canteen_bookings")
    .select(
      "status, service_date, meal_period, profile_id," +
        " profile:profiles!canteen_bookings_profile_id_fkey(full_name, department)",
    )
    .gte("service_date", f.from)
    .lte("service_date", f.to);

  const today = new Date().toISOString().slice(0, 10);
  let served = 0;
  let noShow = 0;
  let cancelled = 0;
  let pending = 0;
  const dept = new Map<string, { served: number; noShow: number }>();
  const meal = new Map<string, { served: number; noShow: number }>();
  const person = new Map<string, { name: string | null; department: string | null; served: number; noShow: number }>();

  for (const b of (data ?? []) as Record<string, any>[]) {
    const profile = one<{ full_name?: string; department?: string }>(b.profile);
    const department = profile?.department ?? null;
    if (f.department && department !== f.department) continue;

    let kind: "served" | "noShow" | "cancelled" | "pending";
    if (b.status === "served") kind = "served";
    else if (b.status === "cancelled") kind = "cancelled";
    else kind = b.service_date < today ? "noShow" : "pending";

    if (kind === "served") served += 1;
    else if (kind === "noShow") noShow += 1;
    else if (kind === "cancelled") cancelled += 1;
    else pending += 1;

    if (kind === "served" || kind === "noShow") {
      const d = department || "Unassigned";
      const dc = dept.get(d) ?? { served: 0, noShow: 0 };
      const mc = meal.get(b.meal_period) ?? { served: 0, noShow: 0 };
      const pc = person.get(b.profile_id) ?? {
        name: profile?.full_name ?? null,
        department,
        served: 0,
        noShow: 0,
      };
      dc[kind] += 1;
      mc[kind] += 1;
      pc[kind] += 1;
      dept.set(d, dc);
      meal.set(b.meal_period, mc);
      person.set(b.profile_id, pc);
    }
  }

  const noShowRate = served + noShow ? Math.round((noShow / (served + noShow)) * 100) : 0;
  return {
    summary: { served, noShow, cancelled, pending, noShowRate },
    byDept: [...dept.entries()]
      .map(([department, v]) => ({ department, ...v }))
      .sort((a, b) => b.served - a.served),
    byMeal: [...meal.entries()]
      .map(([m, v]) => ({ meal: m, ...v }))
      .sort((a, b) => b.served - a.served),
    byPerson: [...person.values()].sort((a, b) => b.served - a.served),
  };
}

// --- Canteen feedback (HR) -------------------------------------------------

export interface CanteenFeedbackRow {
  service_date: string;
  person: string | null;
  department: string | null;
  food: number | null;
  quantity: number | null;
  issue: string;
  status: string;
  comment: string | null;
}

export interface CanteenFeedbackReport {
  summary: { count: number; avgFood: number | null; avgQuantity: number | null; unresolved: number };
  byIssue: { issue: string; count: number }[];
  rows: CanteenFeedbackRow[];
}

/** Canteen feedback over a period: rating averages, issue breakdown, entries. */
export async function getCanteenFeedback(f: CanteenReportFilters): Promise<CanteenFeedbackReport> {
  const supabase = createClient();
  const { data } = await supabase
    .from("canteen_feedback")
    .select(
      "service_date, food_quality, quantity_rating, issue_type, status, comment," +
        " profile:profiles!canteen_feedback_profile_id_fkey(full_name, department)",
    )
    .gte("service_date", f.from)
    .lte("service_date", f.to)
    .order("service_date", { ascending: false });

  const rows: CanteenFeedbackRow[] = [];
  const food: number[] = [];
  const qty: number[] = [];
  const issueMap = new Map<string, number>();
  let unresolved = 0;

  for (const r of (data ?? []) as Record<string, any>[]) {
    const profile = one<{ full_name?: string; department?: string }>(r.profile);
    const department = profile?.department ?? null;
    if (f.department && department !== f.department) continue;
    if (r.food_quality != null) food.push(Number(r.food_quality));
    if (r.quantity_rating != null) qty.push(Number(r.quantity_rating));
    if (r.status === "open") unresolved += 1;
    issueMap.set(r.issue_type, (issueMap.get(r.issue_type) ?? 0) + 1);
    rows.push({
      service_date: r.service_date,
      person: profile?.full_name ?? null,
      department,
      food: r.food_quality ?? null,
      quantity: r.quantity_rating ?? null,
      issue: r.issue_type,
      status: r.status,
      comment: r.comment ?? null,
    });
  }

  const avgOf = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((s, n) => s + n, 0) / xs.length) * 10) / 10 : null;
  return {
    summary: { count: rows.length, avgFood: avgOf(food), avgQuantity: avgOf(qty), unresolved },
    byIssue: [...issueMap.entries()]
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count),
    rows,
  };
}

// --- My meals (self-service) ----------------------------------------------

export interface MyMealRow {
  service_date: string;
  meal: string;
  status: string;
}

export interface MyMealsReport {
  rows: MyMealRow[];
  summary: { served: number; noShow: number; cancelled: number; booked: number };
}

/** The signed-in employee's own canteen bookings over a period. */
export async function getMyMeals(f: { from: string; to: string }): Promise<MyMealsReport> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { rows: [], summary: { served: 0, noShow: 0, cancelled: 0, booked: 0 } };
  const { data } = await supabase
    .from("canteen_bookings")
    .select("service_date, meal_period, status")
    .eq("profile_id", user.id)
    .gte("service_date", f.from)
    .lte("service_date", f.to)
    .order("service_date", { ascending: false });

  const today = new Date().toISOString().slice(0, 10);
  let served = 0;
  let noShow = 0;
  let cancelled = 0;
  let booked = 0;
  const rows: MyMealRow[] = ((data ?? []) as Record<string, any>[]).map((b) => {
    if (b.status === "served") served += 1;
    else if (b.status === "cancelled") cancelled += 1;
    else if (b.service_date < today) noShow += 1;
    else booked += 1;
    return { service_date: b.service_date, meal: b.meal_period, status: b.status };
  });

  return { rows, summary: { served, noShow, cancelled, booked } };
}

// --- Performance appraisal completion / SLA -------------------------------

export interface PerfCompletionRow {
  appraisal_id: string;
  employee: string | null;
  department: string | null;
  manager: string | null;
  stage: string;
  status: string;
  overdue: boolean;
}

export interface PerformanceCompletionReport {
  rows: PerfCompletionRow[];
  summary: { total: number; completed: number; completionPct: number; overdue: number };
  byStatus: { status: string; count: number }[];
}

export interface PerfCompletionFilters {
  cycleId: string;
  periodEnd: string | null;
  department: string | null;
  userId: string | null;
}

const COMPLETED_APPRAISAL = new Set(["completed", "closed"]);

/**
 * Appraisal completion / SLA for one cycle: each appraisal's stage and status,
 * with overdue flagged (not completed and the cycle period has passed, or an
 * explicit `overdue` status). Filter by department and/or employee.
 */
export async function getPerformanceCompletionReport(
  f: PerfCompletionFilters,
): Promise<PerformanceCompletionReport> {
  const supabase = createClient();
  let q = supabase
    .from("appraisals")
    .select(
      "id, stage, status, employee_id," +
        " employee:profiles!employee_id(full_name, department)," +
        " manager:profiles!manager_id(full_name)",
    )
    .eq("cycle_id", f.cycleId);
  if (f.userId) q = q.eq("employee_id", f.userId);
  const { data } = await q;

  const today = new Date().toISOString().slice(0, 10);
  const periodPassed = !!f.periodEnd && f.periodEnd < today;

  const rows: PerfCompletionRow[] = [];
  for (const a of (data ?? []) as Record<string, any>[]) {
    const emp = one<{ full_name?: string; department?: string }>(a.employee);
    const department = emp?.department ?? null;
    if (f.department && department !== f.department) continue;
    const completed = COMPLETED_APPRAISAL.has(a.status);
    const overdue = a.status === "overdue" || (!completed && periodPassed);
    rows.push({
      appraisal_id: a.id,
      employee: emp?.full_name ?? null,
      department,
      manager: one<{ full_name?: string }>(a.manager)?.full_name ?? null,
      stage: a.stage,
      status: a.status,
      overdue,
    });
  }

  rows.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) || (a.employee ?? "").localeCompare(b.employee ?? ""),
  );

  const statusMap = new Map<string, number>();
  for (const r of rows) statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + 1);

  const completed = rows.filter((r) => COMPLETED_APPRAISAL.has(r.status)).length;
  return {
    rows,
    summary: {
      total: rows.length,
      completed,
      completionPct: rows.length ? Math.round((completed / rows.length) * 100) : 0,
      overdue: rows.filter((r) => r.overdue).length,
    },
    byStatus: [...statusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// --- Emergency (EESS) incidents -------------------------------------------

export interface EmergencyIncidentRow {
  created_at: string;
  type: string;
  severity: string;
  status: string;
  sos: boolean;
  location: string | null;
  ackMins: number | null;
  resolveMins: number | null;
}

export interface EmergencyReport {
  summary: {
    total: number;
    sos: number;
    open: number;
    resolved: number;
    broadcasts: number;
    avgAckMins: number | null;
    avgResolveMins: number | null;
  };
  byType: { type: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
  byStatus: { status: string; count: number }[];
  rows: EmergencyIncidentRow[];
}

/** Emergency incidents over a period (by report time): volume, SOS, response
 *  times (to acknowledge / resolve), and type/severity/status breakdowns, plus
 *  the broadcast count. RLS scopes rows to the tenant. */
export async function getEmergencyReport(f: { from: string; to: string }): Promise<EmergencyReport> {
  const supabase = createClient();
  const [{ data: incData }, { count: broadcasts }] = await Promise.all([
    supabase
      .from("eess_incidents")
      .select("created_at, incident_type, severity, status, is_sos, location_text, acknowledged_at, resolved_at")
      .gte("created_at", `${f.from}T00:00:00`)
      .lte("created_at", `${f.to}T23:59:59`)
      .order("created_at", { ascending: false }),
    supabase
      .from("eess_broadcasts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${f.from}T00:00:00`)
      .lte("created_at", `${f.to}T23:59:59`),
  ]);

  const mins = (from: string, to: string | null) =>
    to ? Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000) : null;

  const typeMap = new Map<string, number>();
  const sevMap = new Map<string, number>();
  const statusMap = new Map<string, number>();
  const ackTimes: number[] = [];
  const resolveTimes: number[] = [];
  let sos = 0;
  let resolved = 0;

  const rows: EmergencyIncidentRow[] = ((incData ?? []) as Record<string, any>[]).map((r) => {
    const ackMins = mins(r.created_at, r.acknowledged_at ?? null);
    const resolveMins = mins(r.created_at, r.resolved_at ?? null);
    if (r.is_sos) sos += 1;
    if (r.status === "resolved") resolved += 1;
    if (ackMins != null) ackTimes.push(ackMins);
    if (resolveMins != null) resolveTimes.push(resolveMins);
    typeMap.set(r.incident_type, (typeMap.get(r.incident_type) ?? 0) + 1);
    sevMap.set(r.severity, (sevMap.get(r.severity) ?? 0) + 1);
    statusMap.set(r.status, (statusMap.get(r.status) ?? 0) + 1);
    return {
      created_at: r.created_at,
      type: r.incident_type,
      severity: r.severity,
      status: r.status,
      sos: !!r.is_sos,
      location: r.location_text ?? null,
      ackMins,
      resolveMins,
    };
  });

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, n) => s + n, 0) / xs.length) : null);
  return {
    summary: {
      total: rows.length,
      sos,
      open: rows.length - resolved,
      resolved,
      broadcasts: broadcasts ?? 0,
      avgAckMins: avg(ackTimes),
      avgResolveMins: avg(resolveTimes),
    },
    byType: [...typeMap.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    bySeverity: [...sevMap.entries()].map(([severity, count]) => ({ severity, count })).sort((a, b) => b.count - a.count),
    byStatus: [...statusMap.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    rows,
  };
}

// --- Admin access review --------------------------------------------------
export interface AccessReviewRow {
  id: string;
  name: string | null;
  department: string | null;
  account_role: string;
  functional_roles: string[];
  access_roles: string[];
  is_active: boolean;
  privileged: boolean;
}

export interface AccessReviewReport {
  rows: AccessReviewRow[];
  summary: { users: number; privileged: number; withAccessRoles: number; inactive: number };
}

export interface AccessReviewFilters {
  department: string | null;
  userId: string | null;
}

const PRIVILEGED_FUNCTIONAL_REVIEW = new Set(["system_admin", "hr_admin"]);
const PRIVILEGED_ACCOUNT_REVIEW = new Set(["tenant_admin", "super_admin"]);

/**
 * Access review (governance): each user's account role, functional roles and
 * assigned access roles, with privileged holders flagged for audit. Filter by
 * department and/or person. RLS scopes rows to the tenant.
 */
export async function getAccessReview(f: AccessReviewFilters): Promise<AccessReviewReport> {
  const supabase = createClient();
  let q = supabase
    .from("profiles")
    .select(
      "id, full_name, department, role, is_active," +
        " profile_roles(role), profile_access_roles(tenant_roles(name))",
    );
  if (f.userId) q = q.eq("id", f.userId);
  const { data } = await q.order("full_name");

  const rows: AccessReviewRow[] = [];
  for (const p of (data ?? []) as Record<string, any>[]) {
    const department = p.department ?? null;
    if (f.department && department !== f.department) continue;
    const functional = ((p.profile_roles ?? []) as { role: string }[]).map((r) => r.role);
    const access = ((p.profile_access_roles ?? []) as Record<string, any>[])
      .map((r) => one<{ name?: string }>(r.tenant_roles)?.name)
      .filter((n): n is string => !!n);
    const privileged =
      PRIVILEGED_ACCOUNT_REVIEW.has(p.role) ||
      functional.some((r) => PRIVILEGED_FUNCTIONAL_REVIEW.has(r));
    rows.push({
      id: p.id,
      name: p.full_name ?? null,
      department,
      account_role: p.role,
      functional_roles: functional,
      access_roles: access,
      is_active: !!p.is_active,
      privileged,
    });
  }

  rows.sort(
    (a, b) =>
      Number(b.privileged) - Number(a.privileged) || (a.name ?? "").localeCompare(b.name ?? ""),
  );

  return {
    rows,
    summary: {
      users: rows.length,
      privileged: rows.filter((r) => r.privileged).length,
      withAccessRoles: rows.filter((r) => r.access_roles.length > 0).length,
      inactive: rows.filter((r) => !r.is_active).length,
    },
  };
}

// --- Savings & loan arrears -----------------------------------------------
export interface LoanArrearsRow {
  loan_id: string;
  borrower: string | null;
  department: string | null;
  savings_balance: number;
  principal: number;
  outstanding: number;
  monthly_payment: number;
  expected_paid: number;
  actual_paid: number;
  arrears: number;
  status: string;
  start_date: string;
}

export interface LoanArrearsReport {
  rows: LoanArrearsRow[];
  summary: { loans: number; outstanding: number; arrears: number; inArrears: number };
  byDept: { department: string; loans: number; outstanding: number; arrears: number }[];
}

export interface LoanArrearsFilters {
  from: string;
  to: string;
  department: string | null;
  userId: string | null;
}

/** Whole months elapsed from `start` (yyyy-mm-dd) to today, never negative. */
function monthsSince(start: string): number {
  const s = new Date(start);
  const now = new Date();
  let m = (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth());
  if (now.getDate() < s.getDate()) m -= 1;
  return Math.max(0, m);
}

/**
 * Loan portfolio with arrears. Arrears = scheduled-to-date (monthly payment ×
 * months elapsed, capped at the principal/term) minus actual repayments, for
 * active loans. Period filters by loan start date; department and borrower
 * narrow the list. RLS scopes rows to the tenant.
 */
export async function getLoanArrearsReport(f: LoanArrearsFilters): Promise<LoanArrearsReport> {
  const supabase = createClient();
  const { data: loanData } = await supabase
    .from("loans")
    .select(
      "id, principal, outstanding, monthly_payment, term_months, status, start_date," +
        " account:savings_accounts!loans_account_id_fkey(balance, profile_id," +
        " profile:profiles!savings_accounts_profile_id_fkey(full_name, department))",
    )
    .gte("start_date", f.from)
    .lte("start_date", f.to);

  const loans = (loanData ?? []) as Record<string, any>[];

  // Repayments per loan.
  const paidByLoan = new Map<string, number>();
  const ids = loans.map((l) => l.id as string);
  if (ids.length) {
    const { data: reps } = await supabase
      .from("loan_repayments")
      .select("loan_id, amount")
      .in("loan_id", ids);
    for (const r of (reps ?? []) as { loan_id: string; amount: number }[]) {
      paidByLoan.set(r.loan_id, (paidByLoan.get(r.loan_id) ?? 0) + Number(r.amount));
    }
  }

  const rows: LoanArrearsRow[] = [];
  for (const l of loans) {
    const account = one<Record<string, any>>(l.account);
    const profile = one<{ full_name?: string; department?: string }>(account?.profile);
    const department = profile?.department ?? null;
    if (f.department && department !== f.department) continue;
    if (f.userId && account?.profile_id !== f.userId) continue;

    const principal = Number(l.principal ?? 0);
    const monthly = Number(l.monthly_payment ?? 0);
    const term = Number(l.term_months ?? 0);
    const elapsed = Math.min(term || Infinity, monthsSince(l.start_date));
    const expected = Math.min(principal, Math.round(monthly * elapsed * 100) / 100);
    const actual = paidByLoan.get(l.id) ?? 0;
    const arrears = l.status === "active" ? Math.max(0, Math.round((expected - actual) * 100) / 100) : 0;

    rows.push({
      loan_id: l.id,
      borrower: profile?.full_name ?? null,
      department,
      savings_balance: Number(account?.balance ?? 0),
      principal,
      outstanding: Number(l.outstanding ?? 0),
      monthly_payment: monthly,
      expected_paid: expected,
      actual_paid: actual,
      arrears,
      status: l.status,
      start_date: l.start_date,
    });
  }

  rows.sort((a, b) => b.arrears - a.arrears || (a.borrower ?? "").localeCompare(b.borrower ?? ""));

  const deptMap = new Map<string, { loans: number; outstanding: number; arrears: number }>();
  for (const r of rows) {
    const d = r.department || "Unassigned";
    const cur = deptMap.get(d) ?? { loans: 0, outstanding: 0, arrears: 0 };
    cur.loans += 1;
    cur.outstanding += r.outstanding;
    cur.arrears += r.arrears;
    deptMap.set(d, cur);
  }
  const byDept = [...deptMap.entries()]
    .map(([department, v]) => ({ department, ...v }))
    .sort((a, b) => b.arrears - a.arrears);

  return {
    rows,
    summary: {
      loans: rows.length,
      outstanding: rows.reduce((s, r) => s + r.outstanding, 0),
      arrears: rows.reduce((s, r) => s + r.arrears, 0),
      inArrears: rows.filter((r) => r.arrears > 0).length,
    },
    byDept,
  };
}

// --- Offshore certification compliance ------------------------------------
export type CertStatus = "expired" | "expiring" | "valid" | "missing";

export interface CertCell {
  date: string | null;
  status: CertStatus;
}

export interface OffshoreCertRow {
  staff_id: string;
  name: string | null;
  department: string | null;
  company: string | null;
  position: string | null;
  medical: CertCell;
  bosiet: CertCell;
  huet: CertCell;
  /** Most severe status across the three certs. */
  worst: "expired" | "expiring" | "valid";
}

export interface OffshoreCertReport {
  rows: OffshoreCertRow[];
  summary: { nonCompliant: number; expiring: number; valid: number; total: number };
}

export interface OffshoreCertFilters {
  /** Upcoming-expiry window (inclusive). */
  from: string;
  to: string;
  department: string | null;
}

function classify(date: string | null, today: string, soon: string): CertCell {
  if (!date) return { date: null, status: "missing" };
  if (date < today) return { date, status: "expired" };
  if (date <= soon) return { date, status: "expiring" };
  return { date, status: "valid" };
}

function worstOf(cells: CertCell[]): "expired" | "expiring" | "valid" {
  // A missing cert is as non-compliant as an expired one.
  if (cells.some((c) => c.status === "expired" || c.status === "missing")) return "expired";
  if (cells.some((c) => c.status === "expiring")) return "expiring";
  return "valid";
}

/**
 * Offshore survival-cert (medical / BOSIET / HUET) compliance. Status is judged
 * as of today (expiring = within 30 days). The period filters which upcoming
 * expiries to include; already-expired or missing certs are always shown, since
 * a compliance report must surface them. Department narrows the roster. RLS
 * scopes rows to the tenant.
 */
export async function getOffshoreCertReport(
  filters: OffshoreCertFilters,
): Promise<OffshoreCertReport> {
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_staff")
    .select(
      "id, position, company, medical_expiry, bosiet_expiry, huet_expiry," +
        " profile:profiles!offshore_staff_profile_id_fkey(full_name, department)",
    );

  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const rows: OffshoreCertRow[] = [];
  for (const r of (data ?? []) as Record<string, any>[]) {
    const prof = one<{ full_name?: string; department?: string }>(r.profile);
    const department = prof?.department ?? null;
    if (filters.department && department !== filters.department) continue;

    const medical = classify(r.medical_expiry ?? null, today, in30);
    const bosiet = classify(r.bosiet_expiry ?? null, today, in30);
    const huet = classify(r.huet_expiry ?? null, today, in30);
    const cells = [medical, bosiet, huet];
    const worst = worstOf(cells);

    const inWindow = cells.some((c) => c.date && c.date >= filters.from && c.date <= filters.to);
    if (worst !== "expired" && !inWindow) continue; // always keep non-compliant

    rows.push({
      staff_id: r.id,
      name: prof?.full_name ?? null,
      department,
      company: r.company ?? null,
      position: r.position ?? null,
      medical,
      bosiet,
      huet,
      worst,
    });
  }

  const rank = { expired: 0, expiring: 1, valid: 2 };
  rows.sort((a, b) => rank[a.worst] - rank[b.worst] || (a.name ?? "").localeCompare(b.name ?? ""));

  return {
    rows,
    summary: {
      nonCompliant: rows.filter((r) => r.worst === "expired").length,
      expiring: rows.filter((r) => r.worst === "expiring").length,
      valid: rows.filter((r) => r.worst === "valid").length,
      total: rows.length,
    },
  };
}
