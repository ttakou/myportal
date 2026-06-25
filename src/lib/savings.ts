import { createClient } from "@/lib/supabase/server";
import type {
  AccountSummary,
  SavingsAccount,
  SavingsTxn,
  Statement,
  StatementHolder,
} from "@/types/savings";

const ACCT_SELECT =
  "id, profile_id, balance," +
  " person:profiles!savings_accounts_profile_id_fkey(full_name)," +
  " savings_transactions(id, kind, amount, note, period, created_at)," +
  " loans(id, principal, annual_rate, term_months, monthly_payment, outstanding, status, start_date)";

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
    loans: (row.loans ?? []).map((l: Record<string, any>) => ({
      id: l.id,
      principal: Number(l.principal),
      annual_rate: Number(l.annual_rate),
      term_months: l.term_months,
      monthly_payment: Number(l.monthly_payment),
      outstanding: Number(l.outstanding),
      status: l.status,
      start_date: l.start_date,
    })),
  };
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

const signed = (t: SavingsTxn) => (t.kind === "contribution" ? t.amount : -t.amount);

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

  const totalIn = period.filter((t) => t.kind === "contribution").reduce((s, t) => s + t.amount, 0);
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
