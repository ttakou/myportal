import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AccountSummary,
  SavingsAccount,
  SavingsTxn,
  Statement,
  StatementHolder,
  WithdrawalRequest,
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

/** The tenant's configurable annual savings interest rate (percent). Default 7%. */
export async function getSavingsConfig(): Promise<{ annualRatePct: number }> {
  const supabase = createClient();
  const { data } = await supabase.from("tenants").select("settings").limit(1).maybeSingle();
  const s = ((data?.settings as Record<string, any>) ?? {}).savings ?? {};
  const pct = Number(s.annualRatePct);
  return { annualRatePct: Number.isFinite(pct) && pct >= 0 ? pct : 7 };
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
