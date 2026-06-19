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
