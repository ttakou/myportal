"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/permissions-server";
import { notifyUsers } from "@/lib/notify";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };
const rev = () => revalidatePath("/savings");
async function tenantId(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  return data?.id as string | undefined;
}

/** Create a savings account for a member if they don't have one. */
export async function ensureAccount(profileId: string): Promise<ActionResult> {
  const gate = await requireModule("savings", "operate");
  if (gate) return gate;
  const supabase = createClient();
  const t = await tenantId(supabase);
  if (!t) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase
    .from("savings_accounts")
    .insert({ tenant_id: t, profile_id: profileId });
  if (error && !error.message.includes("duplicate")) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function postTransaction(input: {
  accountId: string;
  kind: "contribution" | "withdrawal";
  amount: number;
  note?: string;
}): Promise<ActionResult> {
  const gate = await requireModule("savings", "create");
  if (gate) return gate;
  if (!(input.amount > 0)) return { ok: false, error: "Amount must be positive." };
  const supabase = createClient();
  const t = await tenantId(supabase);
  if (!t) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("savings_transactions").insert({
    tenant_id: t,
    account_id: input.accountId,
    kind: input.kind,
    amount: input.amount,
    note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Disburse a loan with computed amortized monthly payment. */
export async function disburseLoan(input: {
  accountId: string;
  principal: number;
  annualRatePct: number;
  termMonths: number;
}): Promise<ActionResult> {
  const gate = await requireModule("savings", "approve");
  if (gate) return gate;
  if (!(input.principal > 0) || !(input.termMonths > 0))
    return { ok: false, error: "Principal and term must be positive." };

  const r = (input.annualRatePct || 0) / 100 / 12;
  const n = Math.floor(input.termMonths);
  const monthly =
    r === 0
      ? input.principal / n
      : (input.principal * r) / (1 - Math.pow(1 + r, -n));

  const supabase = createClient();
  const t = await tenantId(supabase);
  if (!t) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("loans").insert({
    tenant_id: t,
    account_id: input.accountId,
    principal: input.principal,
    annual_rate: (input.annualRatePct || 0) / 100,
    term_months: n,
    monthly_payment: Math.round(monthly * 100) / 100,
    outstanding: input.principal,
  });
  if (error) return { ok: false, error: error.message };

  const { data: account } = await supabase
    .from("savings_accounts")
    .select("profile_id")
    .eq("id", input.accountId)
    .maybeSingle();
  await notifyUsers({
    tenantId: t,
    profileIds: [account?.profile_id],
    category: "approval",
    title: "Loan approved and disbursed",
    body: "Your loan has been approved and disbursed to your account.",
    url: "/savings",
  });

  rev();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Monthly bulk contribution import
// ---------------------------------------------------------------------------

export interface SavingsImportRow {
  empNum: string;
  amount: number;
}

export interface SavingsImportRowResult {
  empNum: string;
  name?: string;
  amount: number;
  status: "applied" | "skipped" | "failed";
  error?: string;
}

export interface SavingsImportResult {
  ok: boolean;
  error?: string;
  period?: string;
  applied?: number;
  skipped?: number;
  failed?: number;
  results?: SavingsImportRowResult[];
}

/**
 * Credit a monthly savings sheet into member accounts. Each row carries an
 * employee number and the amount saved that month; we match the number to a
 * profile in the tenant, ensure they have an account, and post a `contribution`
 * transaction tagged with the period. The partial unique index on
 * (account_id, period) makes re-uploading the same month a no-op — rows already
 * imported come back as "skipped", so a corrected sheet can be re-run safely.
 */
export async function importMonthlySavings(input: {
  period: string; // "YYYY-MM"
  rows: SavingsImportRow[];
}): Promise<SavingsImportResult> {
  const gate = await requireModule("savings", "create");
  if (gate) return { ok: false, error: gate.error };

  if (!/^\d{4}-\d{2}$/.test(input.period)) {
    return { ok: false, error: "Period must be a month, e.g. 2026-06." };
  }
  const periodDate = `${input.period}-01`;
  if (!input.rows.length) return { ok: false, error: "Nothing to import." };

  const rls = createClient();
  const t = await tenantId(rls);
  if (!t) return { ok: false, error: "No tenant in scope." };

  // Trusted bulk write bypasses RLS so finance/admin staff who aren't the
  // tenant_admin role can still run the monthly import. Fall back to the
  // RLS client if the service key isn't configured.
  const db = createAdminClient() ?? rls;

  // Resolve employee numbers to profiles within this tenant.
  const empNums = [...new Set(input.rows.map((r) => r.empNum.trim()).filter(Boolean))];
  const { data: profs } = await db
    .from("profiles")
    .select("id, full_name, emp_num")
    .eq("tenant_id", t)
    .in("emp_num", empNums);
  const byEmpNum = new Map<string, { id: string; full_name: string | null }>();
  for (const p of (profs ?? []) as Record<string, any>[]) {
    if (p.emp_num) byEmpNum.set(String(p.emp_num), { id: p.id, full_name: p.full_name });
  }

  // Existing accounts for the resolved members.
  const profileIds = [...byEmpNum.values()].map((p) => p.id);
  const acctByProfile = new Map<string, string>();
  if (profileIds.length) {
    const { data: accts } = await db
      .from("savings_accounts")
      .select("id, profile_id")
      .eq("tenant_id", t)
      .in("profile_id", profileIds);
    for (const a of (accts ?? []) as Record<string, any>[]) {
      acctByProfile.set(a.profile_id, a.id);
    }
  }

  const results: SavingsImportRowResult[] = [];
  for (const row of input.rows) {
    const empNum = row.empNum.trim();
    const base: SavingsImportRowResult = { empNum, amount: row.amount, status: "failed" };

    if (!empNum) {
      results.push({ ...base, error: "Missing employee number." });
      continue;
    }
    if (!(row.amount > 0)) {
      results.push({ ...base, error: "Amount must be a positive number." });
      continue;
    }
    const prof = byEmpNum.get(empNum);
    if (!prof) {
      results.push({ ...base, error: `No employee with number ${empNum}.` });
      continue;
    }
    base.name = prof.full_name ?? undefined;

    // Ensure the member has an account.
    let accountId = acctByProfile.get(prof.id);
    if (!accountId) {
      const { data: created, error: cErr } = await db
        .from("savings_accounts")
        .insert({ tenant_id: t, profile_id: prof.id })
        .select("id")
        .maybeSingle();
      if (cErr || !created) {
        results.push({ ...base, error: cErr?.message ?? "Could not open account." });
        continue;
      }
      accountId = created.id;
      acctByProfile.set(prof.id, created.id);
    }

    const { error: txErr } = await db.from("savings_transactions").insert({
      tenant_id: t,
      account_id: accountId,
      kind: "contribution",
      amount: row.amount,
      period: periodDate,
      note: `Monthly savings ${input.period}`,
    });
    if (txErr) {
      // 23505 = the period is already imported for this account → idempotent skip.
      if (txErr.code === "23505" || txErr.message.includes("duplicate")) {
        results.push({ ...base, status: "skipped", error: "Already imported for this month." });
      } else {
        results.push({ ...base, error: txErr.message });
      }
      continue;
    }
    results.push({ ...base, status: "applied" });
  }

  rev();
  return {
    ok: true,
    period: input.period,
    applied: results.filter((r) => r.status === "applied").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}

export async function recordRepayment(loanId: string, amount: number): Promise<ActionResult> {
  const gate = await requireModule("savings", "operate");
  if (gate) return gate;
  if (!(amount > 0)) return { ok: false, error: "Amount must be positive." };
  const supabase = createClient();
  const t = await tenantId(supabase);
  if (!t) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase
    .from("loan_repayments")
    .insert({ tenant_id: t, loan_id: loanId, amount });
  if (error) return { ok: false, error: error.message };

  const { data: loan } = await supabase
    .from("loans")
    .select("account_id")
    .eq("id", loanId)
    .maybeSingle();
  const { data: account } = loan?.account_id
    ? await supabase
        .from("savings_accounts")
        .select("profile_id")
        .eq("id", loan.account_id)
        .maybeSingle()
    : { data: null };
  await notifyUsers({
    tenantId: t,
    profileIds: [account?.profile_id],
    category: "general",
    title: "Loan repayment recorded",
    body: "Your loan repayment has been processed.",
    url: "/savings",
  });

  rev();
  return { ok: true };
}
