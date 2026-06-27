import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccess } from "@/lib/auth";
import {
  money,
  type AccountSummary,
  type SavingsAccount,
  type SavingsTxn,
  type Statement,
  type StatementHolder,
  type WithdrawalRequest,
} from "@/types/savings";

const ACCT_SELECT =
  "id, profile_id, balance," +
  " person:profiles!savings_accounts_profile_id_fkey(full_name)," +
  " savings_transactions(id, kind, amount, note, period, created_at)";

function mapAccount(row: Record<string, any>): SavingsAccount {
  const person = Array.isArray(row.person) ? row.person[0] : row.person;
  return {
    id: row.id,
    profile_id: row.profile_id,
    person_name: person?.full_name ?? null,
    balance: Number(row.balance),
    transactions: (row.savings_transactions ?? [])
      .map((t: Record<string, any>) => ({
        id: t.id,
        kind: t.kind,
        amount: Number(t.amount),
        note: t.note,
        period: t.period ?? null,
        created_at: t.created_at,
      }))
      .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1)),
  };
}

export interface StatementVerification {
  code: string;
  tenantName: string | null;
  holderName: string | null;
  from: string;
  to: string;
  opening: number;
  closing: number;
  generatedAt: string;
}

/**
 * Snapshot a statement under a short public code (idempotent per identical
 * snapshot), so a printed copy can be checked at /verify/statement. Uses the
 * service role. Returns the code, or null if the service key isn't configured.
 */
export async function getOrCreateStatementCode(input: {
  tenantId: string;
  tenantName: string | null;
  profileId: string;
  holderName: string | null;
  from: string;
  to: string;
  opening: number;
  closing: number;
}): Promise<string | null> {
  const db = createAdminClient();
  if (!db) return null;
  const { data: existing } = await db
    .from("savings_statement_verifications")
    .select("code")
    .eq("profile_id", input.profileId)
    .eq("from_date", input.from)
    .eq("to_date", input.to)
    .eq("opening", input.opening)
    .eq("closing", input.closing)
    .maybeSingle();
  if (existing?.code) return existing.code as string;

  // Short, human-readable code, e.g. "ADX-7F3A-2B91".
  const hex = (n: number) =>
    Array.from({ length: n }, () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]).join("");
  const prefix = (input.tenantName ?? "STMT").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "STM";
  const code = `${prefix}-${hex(4)}-${hex(4)}`;
  const { error } = await db.from("savings_statement_verifications").insert({
    code,
    tenant_id: input.tenantId,
    profile_id: input.profileId,
    tenant_name: input.tenantName,
    holder_name: input.holderName,
    from_date: input.from,
    to_date: input.to,
    opening: input.opening,
    closing: input.closing,
  });
  if (error) {
    // Lost a race on the unique snapshot — fetch the winner's code.
    const { data } = await db
      .from("savings_statement_verifications")
      .select("code")
      .eq("profile_id", input.profileId)
      .eq("from_date", input.from)
      .eq("to_date", input.to)
      .eq("opening", input.opening)
      .eq("closing", input.closing)
      .maybeSingle();
    return (data?.code as string) ?? null;
  }
  return code;
}

/** Look up a statement verification by its public code (service role). */
export async function getStatementByCode(code: string): Promise<StatementVerification | null> {
  const db = createAdminClient();
  if (!db || !code) return null;
  const { data } = await db
    .from("savings_statement_verifications")
    .select("code, tenant_name, holder_name, from_date, to_date, opening, closing, generated_at")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  if (!data) return null;
  return {
    code: data.code as string,
    tenantName: data.tenant_name ?? null,
    holderName: data.holder_name ?? null,
    from: data.from_date as string,
    to: data.to_date as string,
    opening: Number(data.opening),
    closing: Number(data.closing),
    generatedAt: data.generated_at as string,
  };
}

export interface SavingsGoal {
  targetAmount: number;
  targetDate: string;
}

/** The signed-in member's savings goal, if set. */
export async function getMyGoal(): Promise<SavingsGoal | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("savings_goals")
    .select("target_amount, target_date")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!data) return null;
  return { targetAmount: Number(data.target_amount), targetDate: data.target_date as string };
}

/** The tenant's configurable annual savings interest rate (percent). Default 7%. */
export async function getSavingsConfig(): Promise<{ annualRatePct: number }> {
  const supabase = createClient();
  const { data } = await supabase.from("tenants").select("settings").limit(1).maybeSingle();
  const s = ((data?.settings as Record<string, any>) ?? {}).savings ?? {};
  const pct = Number(s.annualRatePct);
  return { annualRatePct: Number.isFinite(pct) && pct >= 0 ? pct : 7 };
}

export interface SavingsAuditEntry {
  id: string;
  action: string;
  entity: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
}

/** Recent savings-module audit entries (admin-gated by the page). */
export async function getSavingsAuditLog(limit = 100): Promise<SavingsAuditEntry[]> {
  const rls = createClient();
  const { data: tRow } = await rls.from("tenants").select("id").limit(1).maybeSingle();
  if (!tRow?.id) return [];
  const db = createAdminClient() ?? rls;
  const { data } = await db
    .from("savings_audit_log")
    .select("id, action, entity, summary, created_at, actor:profiles!savings_audit_log_actor_id_fkey(full_name)")
    .eq("tenant_id", tRow.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, any>[]).map((r) => {
    const actor = Array.isArray(r.actor) ? r.actor[0] : r.actor;
    return {
      id: r.id,
      action: r.action,
      entity: r.entity,
      summary: r.summary,
      actorName: actor?.full_name ?? null,
      createdAt: r.created_at,
    };
  });
}

// ---------------------------------------------------------------------------
// Approver: "My Approvals" history
// ---------------------------------------------------------------------------

/**
 * Whether the signed-in user is a savings approver — finance/admin, or a
 * configured import-workflow validator. Drives the "My Approvals" submenu.
 */
export const isSavingsApprover = cache(async (): Promise<boolean> => {
  const access = await getAccess();
  if (access.isFinance || access.isAdmin || access.isSystemAdmin) return true;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("tenants").select("settings").limit(1).maybeSingle();
  const steps = (((data?.settings as Record<string, any>) ?? {}).savings ?? {}).importApproval;
  if (Array.isArray(steps)) {
    for (const s of steps) {
      if (Array.isArray(s?.validators) && s.validators.map(String).includes(user.id)) return true;
    }
  }
  return false;
});

export interface ApprovalHistoryItem {
  id: string;
  date: string;
  type: "Import" | "Withdrawal";
  summary: string;
  decision: "approved" | "rejected" | "released";
  outcome: string | null;
}

/**
 * The signed-in approver's full decision history across savings — import-batch
 * approvals/rejections and withdrawal approvals/declines/releases. Reads with
 * the service role since a non-admin approver can't see others' rows under RLS.
 */
export async function getMyApprovalHistory(): Promise<ApprovalHistoryItem[]> {
  const rls = createClient();
  const {
    data: { user },
  } = await rls.auth.getUser();
  if (!user) return [];
  const { data: tRow } = await rls.from("tenants").select("id").limit(1).maybeSingle();
  if (!tRow?.id) return [];
  const t = tRow.id as string;
  const db = createAdminClient();
  if (!db) return [];

  const items: ApprovalHistoryItem[] = [];

  const { data: imp } = await db
    .from("savings_import_approvals")
    .select(
      "id, decision, step_index, created_at," +
        " batch:savings_import_batches!savings_import_approvals_batch_id_fkey(period, status)",
    )
    .eq("tenant_id", t)
    .eq("decided_by", user.id)
    .order("created_at", { ascending: false });
  for (const r of (imp ?? []) as Record<string, any>[]) {
    const b = Array.isArray(r.batch) ? r.batch[0] : r.batch;
    items.push({
      id: `imp-${r.id}`,
      date: r.created_at,
      type: "Import",
      summary: `Monthly import ${String(b?.period ?? "").slice(0, 7)} · step ${Number(r.step_index) + 1}`,
      decision: r.decision === "approve" ? "approved" : "rejected",
      outcome: b?.status ?? null,
    });
  }

  const { data: wd } = await db
    .from("savings_withdrawal_requests")
    .select(
      "id, amount, status, decided_at, released_at, decided_by, released_by," +
        " person:profiles!savings_withdrawal_requests_profile_id_fkey(full_name)",
    )
    .eq("tenant_id", t)
    .or(`decided_by.eq.${user.id},released_by.eq.${user.id}`)
    .order("created_at", { ascending: false });
  for (const r of (wd ?? []) as Record<string, any>[]) {
    const p = Array.isArray(r.person) ? r.person[0] : r.person;
    const who = p?.full_name ?? "a member";
    if (r.decided_by === user.id && r.decided_at) {
      items.push({
        id: `wd-d-${r.id}`,
        date: r.decided_at,
        type: "Withdrawal",
        summary: `${who} · ${money(Number(r.amount))}`,
        decision: r.status === "rejected" ? "rejected" : "approved",
        outcome: r.status,
      });
    }
    if (r.released_by === user.id && r.released_at) {
      items.push({
        id: `wd-r-${r.id}`,
        date: r.released_at,
        type: "Withdrawal",
        summary: `${who} · ${money(Number(r.amount))}`,
        decision: "released",
        outcome: "released",
      });
    }
  }

  items.sort((a, b) => (a.date < b.date ? 1 : -1));
  return items;
}

// ---------------------------------------------------------------------------
// Import approval workflow (config + validator inbox + admin overview)
// ---------------------------------------------------------------------------

export interface SavingsImportStepConfig {
  name: string;
  validators: string[]; // profile ids
}

/** The configured import-approval steps (empty = direct commit). */
export async function getSavingsImportSteps(): Promise<SavingsImportStepConfig[]> {
  const supabase = createClient();
  const { data } = await supabase.from("tenants").select("settings").limit(1).maybeSingle();
  const arr = (((data?.settings as Record<string, any>) ?? {}).savings ?? {}).importApproval;
  if (!Array.isArray(arr)) return [];
  return arr.map((s: any) => ({
    name: String(s?.name ?? "Approval"),
    validators: Array.isArray(s?.validators) ? s.validators.map(String) : [],
  }));
}

export interface ImportImpactRow {
  empNum: string;
  name: string | null;
  amount: number;
  currentBalance: number | null;
  newBalance: number | null;
  status: "apply" | "new-account" | "skip" | "error";
}

/** Recompute an import's impact (current → new balance) against live balances. */
async function computeImportImpact(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  t: string,
  period: string,
  rows: { empNum: string; amount: number }[],
): Promise<{ rows: ImportImpactRow[]; totalContribution: number; willApply: number; errors: number; alreadyImported: number }> {
  const periodDate = `${period}-01`;
  const empNums = [...new Set(rows.map((r) => String(r.empNum).trim()).filter(Boolean))];
  const { data: profs } = empNums.length
    ? await db.from("profiles").select("id, full_name, emp_num").eq("tenant_id", t).in("emp_num", empNums)
    : { data: [] };
  const byEmp = new Map<string, { id: string; full_name: string | null }>();
  for (const p of (profs ?? []) as Record<string, any>[]) byEmp.set(String(p.emp_num), { id: p.id, full_name: p.full_name });

  const profileIds = [...byEmp.values()].map((p) => p.id);
  const acctByProfile = new Map<string, { id: string; balance: number }>();
  const importedAccts = new Set<string>();
  if (profileIds.length) {
    const { data: accts } = await db.from("savings_accounts").select("id, profile_id, balance").eq("tenant_id", t).in("profile_id", profileIds);
    for (const a of (accts ?? []) as Record<string, any>[]) acctByProfile.set(a.profile_id, { id: a.id, balance: Number(a.balance) });
    const acctIds = [...acctByProfile.values()].map((a) => a.id);
    if (acctIds.length) {
      const { data: existing } = await db.from("savings_transactions").select("account_id").eq("kind", "contribution").eq("period", periodDate).in("account_id", acctIds);
      for (const r of (existing ?? []) as Record<string, any>[]) importedAccts.add(r.account_id);
    }
  }

  const impact: ImportImpactRow[] = rows.map((row) => {
    const empNum = String(row.empNum).trim();
    if (!empNum || !(row.amount > 0)) return { empNum, name: null, amount: row.amount, currentBalance: null, newBalance: null, status: "error" };
    const prof = byEmp.get(empNum);
    if (!prof) return { empNum, name: null, amount: row.amount, currentBalance: null, newBalance: null, status: "error" };
    const acct = acctByProfile.get(prof.id);
    const cur = acct?.balance ?? 0;
    if (acct && importedAccts.has(acct.id)) return { empNum, name: prof.full_name, amount: row.amount, currentBalance: cur, newBalance: cur, status: "skip" };
    return { empNum, name: prof.full_name, amount: row.amount, currentBalance: cur, newBalance: cur + row.amount, status: acct ? "apply" : "new-account" };
  });

  const willRows = impact.filter((r) => r.status === "apply" || r.status === "new-account");
  return {
    rows: impact,
    totalContribution: willRows.reduce((s, r) => s + r.amount, 0),
    willApply: willRows.length,
    errors: impact.filter((r) => r.status === "error").length,
    alreadyImported: impact.filter((r) => r.status === "skip").length,
  };
}

export interface PendingImportApproval {
  batchId: string;
  period: string; // YYYY-MM
  stepIndex: number;
  stepName: string;
  totalSteps: number;
  createdAt: string;
  submittedBy: string | null;
  totalContribution: number;
  willApply: number;
  errors: number;
  alreadyImported: number;
  rows: ImportImpactRow[];
}

/** Pending import batches the signed-in user can approve at the current step. */
export async function getMyPendingImportApprovals(): Promise<PendingImportApproval[]> {
  const rls = createClient();
  const { data: { user } } = await rls.auth.getUser();
  if (!user) return [];
  const { data: tRow } = await rls.from("tenants").select("id").limit(1).maybeSingle();
  if (!tRow?.id) return [];
  const t = tRow.id as string;
  const db = createAdminClient();
  if (!db) return [];

  const { data: batches } = await db
    .from("savings_import_batches")
    .select("id, period, rows, steps, current_step, created_at, created_by, creator:profiles!savings_import_batches_created_by_fkey(full_name)")
    .eq("tenant_id", t)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const out: PendingImportApproval[] = [];
  for (const b of (batches ?? []) as Record<string, any>[]) {
    const steps = (b.steps ?? []) as SavingsImportStepConfig[];
    const step = steps[b.current_step];
    if (!step || !step.validators.map(String).includes(user.id)) continue;
    const period = String(b.period).slice(0, 7);
    const impact = await computeImportImpact(db, t, period, (b.rows ?? []) as { empNum: string; amount: number }[]);
    const creator = Array.isArray(b.creator) ? b.creator[0] : b.creator;
    out.push({
      batchId: b.id,
      period,
      stepIndex: b.current_step,
      stepName: step.name,
      totalSteps: steps.length,
      createdAt: b.created_at,
      submittedBy: creator?.full_name ?? null,
      totalContribution: impact.totalContribution,
      willApply: impact.willApply,
      errors: impact.errors,
      alreadyImported: impact.alreadyImported,
      rows: impact.rows,
    });
  }
  return out;
}

export interface ImportBatchSummary {
  id: string;
  period: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  stepName: string | null;
  submittedBy: string | null;
  createdAt: string;
  committed: { applied: number; skipped: number; failed: number } | null;
}

/** Recent import batches for the admin overview. */
export async function getImportBatches(limit = 20): Promise<ImportBatchSummary[]> {
  const rls = createClient();
  const { data: tRow } = await rls.from("tenants").select("id").limit(1).maybeSingle();
  if (!tRow?.id) return [];
  const db = createAdminClient() ?? rls;
  const { data } = await db
    .from("savings_import_batches")
    .select("id, period, status, current_step, steps, created_at, creator:profiles!savings_import_batches_created_by_fkey(full_name), commit_result")
    .eq("tenant_id", tRow.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, any>[]).map((b) => {
    const steps = (b.steps ?? []) as SavingsImportStepConfig[];
    const creator = Array.isArray(b.creator) ? b.creator[0] : b.creator;
    const cr = b.commit_result as Record<string, number> | null;
    return {
      id: b.id,
      period: String(b.period).slice(0, 7),
      status: b.status,
      currentStep: b.current_step,
      totalSteps: steps.length,
      stepName: steps[b.current_step]?.name ?? null,
      submittedBy: creator?.full_name ?? null,
      createdAt: b.created_at,
      committed: cr ? { applied: Number(cr.applied ?? 0), skipped: Number(cr.skipped ?? 0), failed: Number(cr.failed ?? 0) } : null,
    };
  });
}

function mapWithdrawal(row: Record<string, any>): WithdrawalRequest {
  const person = Array.isArray(row.person) ? row.person[0] : row.person;
  const acct = Array.isArray(row.account) ? row.account[0] : row.account;
  return {
    id: row.id,
    profile_id: row.profile_id,
    person_name: person?.full_name ?? null,
    amount: Number(row.amount),
    reason: row.reason ?? null,
    status: row.status,
    decision_note: row.decision_note ?? null,
    decided_at: row.decided_at ?? null,
    released_at: row.released_at ?? null,
    created_at: row.created_at,
    account_balance: acct ? Number(acct.balance) : undefined,
  };
}

/** The signed-in member's own withdrawal requests, newest first. */
export async function getMyWithdrawalRequests(): Promise<WithdrawalRequest[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("savings_withdrawal_requests")
    .select("id, profile_id, amount, reason, status, decision_note, decided_at, released_at, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapWithdrawal);
}

/**
 * All withdrawal requests in the current tenant, for finance/admin review.
 * Uses the service role so finance approvers who aren't the tenant_admin role
 * can still see pending requests; callers must gate on finance/admin access.
 */
export async function getWithdrawalRequests(): Promise<WithdrawalRequest[]> {
  const rls = createClient();
  const { data: t } = await rls.from("tenants").select("id").limit(1).maybeSingle();
  if (!t?.id) return [];
  const db = createAdminClient() ?? rls;
  const { data } = await db
    .from("savings_withdrawal_requests")
    .select(
      "id, profile_id, amount, reason, status, decision_note, decided_at, released_at, created_at," +
        " person:profiles!savings_withdrawal_requests_profile_id_fkey(full_name)," +
        " account:savings_accounts!savings_withdrawal_requests_account_id_fkey(balance)",
    )
    .eq("tenant_id", t.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapWithdrawal);
}

export async function getMyAccount(): Promise<SavingsAccount | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("savings_accounts")
    .select(ACCT_SELECT)
    .eq("profile_id", user.id)
    .maybeSingle();
  return data ? mapAccount(data as Record<string, any>) : null;
}

export async function getAccounts(): Promise<AccountSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("savings_accounts")
    .select("id, profile_id, balance, person:profiles!savings_accounts_profile_id_fkey(full_name)")
    .order("balance", { ascending: false });
  if (error) {
    console.error("getAccounts:", error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, any>) => {
    const person = Array.isArray(r.person) ? r.person[0] : r.person;
    return {
      id: r.id,
      profile_id: r.profile_id,
      person_name: person?.full_name ?? null,
      balance: Number(r.balance),
    };
  });
}

/**
 * A transaction's effective date for statement purposes: the savings month it
 * belongs to (`period`, for monthly imports) or, lacking one, when it was
 * recorded. So a June contribution uploaded in July still falls in June.
 */
function effectiveDate(t: SavingsTxn): string {
  return (t.period ?? t.created_at).slice(0, 10);
}

const signed = (t: SavingsTxn) => (t.kind === "withdrawal" ? -t.amount : t.amount);

/**
 * Build a bank-style statement for one member over [from, to] (inclusive ISO
 * dates). Opening balance is the signed running total of everything before
 * `from`; the period rows and closing balance follow. RLS scopes the query —
 * a member sees only their own account; admins can pass any profileId.
 */
export async function getStatement(
  profileId: string,
  from: string,
  to: string,
): Promise<Statement | null> {
  const supabase = createClient();

  const [{ data: acct }, { data: prof }] = await Promise.all([
    supabase
      .from("savings_accounts")
      .select("id, profile_id, savings_transactions(id, kind, amount, note, period, created_at)")
      .eq("profile_id", profileId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, emp_num, email, department, job_title, employee_type")
      .eq("id", profileId)
      .maybeSingle(),
  ]);

  if (!prof) return null;

  const holder: StatementHolder = {
    profile_id: prof.id,
    full_name: prof.full_name ?? null,
    emp_num: prof.emp_num ?? null,
    email: prof.email ?? null,
    department: prof.department ?? null,
    job_title: prof.job_title ?? null,
    employee_type: prof.employee_type ?? null,
  };

  const all: SavingsTxn[] = ((acct?.savings_transactions ?? []) as Record<string, any>[]).map(
    (t) => ({
      id: t.id,
      kind: t.kind,
      amount: Number(t.amount),
      note: t.note,
      period: t.period ?? null,
      created_at: t.created_at,
    }),
  );

  let opening = 0;
  const period: SavingsTxn[] = [];
  for (const t of all) {
    const d = effectiveDate(t);
    if (d < from) opening += signed(t);
    else if (d <= to) period.push(t);
  }
  period.sort((a, b) => (effectiveDate(a) < effectiveDate(b) ? -1 : 1));

  const totalIn = period.filter((t) => t.kind !== "withdrawal").reduce((s, t) => s + t.amount, 0);
  const totalOut = period.filter((t) => t.kind === "withdrawal").reduce((s, t) => s + t.amount, 0);

  return {
    holder,
    from,
    to,
    openingBalance: opening,
    closingBalance: opening + totalIn - totalOut,
    totalIn,
    totalOut,
    transactions: period,
  };
}
