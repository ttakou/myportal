import { createClient } from "@/lib/supabase/server";
import type { AccountSummary, SavingsAccount } from "@/types/savings";

const ACCT_SELECT =
  "id, profile_id, balance," +
  " person:profiles!savings_accounts_profile_id_fkey(full_name)," +
  " savings_transactions(id, kind, amount, note, created_at)," +
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
