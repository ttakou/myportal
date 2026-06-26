"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/permissions-server";
import { notifyUsers } from "@/lib/notify";
import type { SupabaseClient } from "@supabase/supabase-js";

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

// ---------------------------------------------------------------------------
// Interest configuration + monthly accrual
// ---------------------------------------------------------------------------

/** Set the tenant's annual savings interest rate (percent). Admin only. */
export async function setSavingsAnnualRate(annualRatePct: number): Promise<ActionResult> {
  const gate = await requireModule("savings", "operate");
  if (gate) return gate;
  if (!(annualRatePct >= 0) || annualRatePct > 100)
    return { ok: false, error: "Rate must be between 0 and 100." };
  const rls = createClient();
  const t = await tenantId(rls);
  if (!t) return { ok: false, error: "No tenant in scope." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Server is missing the service-role key." };

  const { data: row } = await admin.from("tenants").select("settings").eq("id", t).maybeSingle();
  const settings = (row?.settings as Record<string, unknown>) ?? {};
  const savings = { ...((settings.savings as Record<string, unknown>) ?? {}) };
  savings.annualRatePct = Math.round(annualRatePct * 100) / 100;
  const { error } = await admin
    .from("tenants")
    .update({ settings: { ...settings, savings } })
    .eq("id", t);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/savings");
  return { ok: true };
}

export interface InterestRunResult {
  ok: boolean;
  error?: string;
  period?: string;
  ratePct?: number;
  applied?: number;
  skipped?: number;
  totalInterest?: number;
}

/**
 * Post one month of interest to every account. Interest = balance × (annual
 * rate / 12), rounded to whole XAF. It compounds: because the credit raises the
 * balance, next month's accrual is computed on the larger total. Idempotent per
 * month via the (account, kind, period) unique index — re-running a month skips
 * accounts already accrued.
 */
export async function postMonthlyInterest(input: { period: string }): Promise<InterestRunResult> {
  const gate = await requireModule("savings", "create");
  if (gate) return { ok: false, error: gate.error };
  if (!/^\d{4}-\d{2}$/.test(input.period))
    return { ok: false, error: "Period must be a month, e.g. 2026-06." };
  const periodDate = `${input.period}-01`;

  const rls = createClient();
  const t = await tenantId(rls);
  if (!t) return { ok: false, error: "No tenant in scope." };
  const db = createAdminClient() ?? rls;

  // Resolve the configured rate from tenant settings.
  const { data: trow } = await db.from("tenants").select("settings").eq("id", t).maybeSingle();
  const s = ((trow?.settings as Record<string, any>) ?? {}).savings ?? {};
  const ratePct = Number.isFinite(Number(s.annualRatePct)) ? Number(s.annualRatePct) : 7;
  const monthlyRate = ratePct / 100 / 12;

  const { data: accts } = await db
    .from("savings_accounts")
    .select("id, balance")
    .eq("tenant_id", t);

  let applied = 0;
  let skipped = 0;
  let totalInterest = 0;
  for (const a of (accts ?? []) as Record<string, any>[]) {
    const interest = Math.round(Number(a.balance) * monthlyRate);
    if (!(interest >= 1)) {
      skipped++;
      continue;
    }
    const { error } = await db.from("savings_transactions").insert({
      tenant_id: t,
      account_id: a.id,
      kind: "interest",
      amount: interest,
      period: periodDate,
      note: `Monthly interest ${input.period} (${ratePct}%/yr)`,
    });
    if (error) {
      // already accrued for this month → idempotent skip
      if (error.code === "23505" || error.message.includes("duplicate")) skipped++;
      else return { ok: false, error: error.message };
    } else {
      applied++;
      totalInterest += interest;
    }
  }

  rev();
  return { ok: true, period: input.period, ratePct, applied, skipped, totalInterest };
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

export type SavingsPreviewStatus = "apply" | "new-account" | "skip" | "error";

export interface SavingsPreviewRow {
  empNum: string;
  name: string | null;
  department: string | null;
  amount: number;
  currentBalance: number | null;
  newBalance: number | null;
  status: SavingsPreviewStatus;
  note?: string;
}

export interface SavingsImportPreview {
  ok: boolean;
  error?: string;
  period?: string;
  rows?: SavingsPreviewRow[];
  summary?: {
    willApply: number;
    newAccounts: number;
    alreadyImported: number;
    errors: number;
    totalContribution: number;
    totalCurrent: number;
    totalNew: number;
  };
}

/**
 * Dry-run the monthly import: resolve each row, compute the new balance it would
 * produce and flag issues — WITHOUT writing anything. Drives the preview/impact
 * report the admin validates before committing with importMonthlySavings.
 */
export async function previewMonthlySavings(input: {
  period: string;
  rows: SavingsImportRow[];
}): Promise<SavingsImportPreview> {
  const gate = await requireModule("savings", "create");
  if (gate) return { ok: false, error: gate.error };
  if (!/^\d{4}-\d{2}$/.test(input.period))
    return { ok: false, error: "Period must be a month, e.g. 2026-06." };
  if (!input.rows.length) return { ok: false, error: "Nothing to preview." };
  const periodDate = `${input.period}-01`;

  const rls = createClient();
  const t = await tenantId(rls);
  if (!t) return { ok: false, error: "No tenant in scope." };
  const db = createAdminClient() ?? rls;

  const empNums = [...new Set(input.rows.map((r) => r.empNum.trim()).filter(Boolean))];
  const { data: profs } = await db
    .from("profiles")
    .select("id, full_name, emp_num, department")
    .eq("tenant_id", t)
    .in("emp_num", empNums);
  const byEmpNum = new Map<string, { id: string; full_name: string | null; department: string | null }>();
  for (const p of (profs ?? []) as Record<string, any>[]) {
    if (p.emp_num) byEmpNum.set(String(p.emp_num), { id: p.id, full_name: p.full_name, department: p.department });
  }

  // Current accounts (balance) + which already have this period's contribution.
  const profileIds = [...byEmpNum.values()].map((p) => p.id);
  const acctByProfile = new Map<string, { id: string; balance: number }>();
  const importedAccts = new Set<string>();
  if (profileIds.length) {
    const { data: accts } = await db
      .from("savings_accounts")
      .select("id, profile_id, balance")
      .eq("tenant_id", t)
      .in("profile_id", profileIds);
    for (const a of (accts ?? []) as Record<string, any>[]) {
      acctByProfile.set(a.profile_id, { id: a.id, balance: Number(a.balance) });
    }
    const acctIds = [...acctByProfile.values()].map((a) => a.id);
    if (acctIds.length) {
      const { data: existing } = await db
        .from("savings_transactions")
        .select("account_id")
        .eq("kind", "contribution")
        .eq("period", periodDate)
        .in("account_id", acctIds);
      for (const r of (existing ?? []) as Record<string, any>[]) importedAccts.add(r.account_id);
    }
  }

  const rows: SavingsPreviewRow[] = input.rows.map((row) => {
    const empNum = row.empNum.trim();
    if (!empNum) return { empNum, name: null, department: null, amount: row.amount, currentBalance: null, newBalance: null, status: "error", note: "Missing employee number." };
    if (!(row.amount > 0)) return { empNum, name: null, department: null, amount: row.amount, currentBalance: null, newBalance: null, status: "error", note: "Amount must be a positive number." };
    const prof = byEmpNum.get(empNum);
    if (!prof) return { empNum, name: null, department: null, amount: row.amount, currentBalance: null, newBalance: null, status: "error", note: `No employee with number ${empNum}.` };

    const acct = acctByProfile.get(prof.id);
    const currentBalance = acct?.balance ?? 0;
    if (acct && importedAccts.has(acct.id)) {
      return { empNum, name: prof.full_name, department: prof.department, amount: row.amount, currentBalance, newBalance: currentBalance, status: "skip", note: "Already imported for this month." };
    }
    return {
      empNum,
      name: prof.full_name,
      department: prof.department,
      amount: row.amount,
      currentBalance,
      newBalance: currentBalance + row.amount,
      status: acct ? "apply" : "new-account",
      note: acct ? undefined : "A new savings account will be opened.",
    };
  });

  const willApplyRows = rows.filter((r) => r.status === "apply" || r.status === "new-account");
  return {
    ok: true,
    period: input.period,
    rows,
    summary: {
      willApply: willApplyRows.length,
      newAccounts: rows.filter((r) => r.status === "new-account").length,
      alreadyImported: rows.filter((r) => r.status === "skip").length,
      errors: rows.filter((r) => r.status === "error").length,
      totalContribution: willApplyRows.reduce((s, r) => s + r.amount, 0),
      totalCurrent: willApplyRows.reduce((s, r) => s + (r.currentBalance ?? 0), 0),
      totalNew: willApplyRows.reduce((s, r) => s + (r.newBalance ?? 0), 0),
    },
  };
}

/**
 * Credit a monthly savings sheet into member accounts. Each row carries an
 * employee number and the amount saved that month; we match the number to a
 * profile in the tenant, ensure they have an account, and post a `contribution`
 * transaction tagged with the period. The partial unique index on
 * (account_id, period) makes re-uploading the same month a no-op — rows already
 * imported come back as "skipped", so a corrected sheet can be re-run safely.
 * Admins validate the impact via previewMonthlySavings before calling this.
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

// ---------------------------------------------------------------------------
// Member withdrawal requests (request -> finance approval -> release)
// ---------------------------------------------------------------------------

/** Profile ids of the tenant's finance approvers (finance role + admins). */
async function financeApproverIds(
  db: SupabaseClient,
  tenant: string,
): Promise<string[]> {
  const [{ data: admins }, { data: roleRows }] = await Promise.all([
    db.from("profiles").select("id").eq("tenant_id", tenant).eq("is_active", true).in("role", ["tenant_admin", "super_admin"]),
    db.from("profile_roles").select("profile_id").eq("tenant_id", tenant).in("role", ["finance", "system_admin"]),
  ]);
  const ids = new Set<string>();
  for (const r of admins ?? []) ids.add(r.id as string);
  for (const r of roleRows ?? []) ids.add(r.profile_id as string);
  return [...ids];
}

/** A member requests to withdraw funds; routed to finance for approval. */
export async function requestWithdrawal(input: {
  amount: number;
  reason?: string;
}): Promise<ActionResult> {
  if (!(input.amount > 0)) return { ok: false, error: "Amount must be positive." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: acct } = await supabase
    .from("savings_accounts")
    .select("id, tenant_id, balance")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!acct) return { ok: false, error: "You don't have a savings account yet." };
  if (input.amount > Number(acct.balance))
    return { ok: false, error: "Amount exceeds your available balance." };

  // Block stacking multiple open requests.
  const { count } = await supabase
    .from("savings_withdrawal_requests")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .in("status", ["requested", "approved"]);
  if ((count ?? 0) > 0)
    return { ok: false, error: "You already have a pending withdrawal request." };

  const { error } = await supabase.from("savings_withdrawal_requests").insert({
    tenant_id: acct.tenant_id,
    account_id: acct.id,
    profile_id: user.id,
    amount: input.amount,
    reason: input.reason?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  // Notify finance approvers.
  const admin = createAdminClient();
  if (admin) {
    const approvers = await financeApproverIds(admin, acct.tenant_id as string);
    await notifyUsers({
      tenantId: acct.tenant_id as string,
      profileIds: approvers,
      category: "approval",
      title: "Savings withdrawal request",
      body: "A member has requested a savings withdrawal awaiting your approval.",
      url: "/savings?view=admin",
    });
  }
  rev();
  return { ok: true };
}

/** Finance approves or rejects a pending withdrawal request. */
export async function decideWithdrawal(
  id: string,
  approve: boolean,
  note?: string,
): Promise<ActionResult> {
  const gate = await requireModule("savings", "approve");
  if (gate) return gate;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const db = createAdminClient() ?? supabase;

  const { data: req } = await db
    .from("savings_withdrawal_requests")
    .select("id, tenant_id, profile_id, amount, status")
    .eq("id", id)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "requested")
    return { ok: false, error: `Request is already ${req.status}.` };

  const { error } = await db
    .from("savings_withdrawal_requests")
    .update({
      status: approve ? "approved" : "rejected",
      decided_by: user?.id ?? null,
      decided_at: new Date().toISOString(),
      decision_note: note?.trim() || null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await notifyUsers({
    tenantId: req.tenant_id as string,
    profileIds: [req.profile_id as string],
    category: "approval",
    title: approve ? "Withdrawal approved" : "Withdrawal declined",
    body: approve
      ? "Your savings withdrawal has been approved and is pending release of funds."
      : `Your savings withdrawal was declined.${note ? ` Note: ${note.trim()}` : ""}`,
    url: "/savings?view=mine",
  });
  rev();
  return { ok: true };
}

/**
 * Finance releases the funds for an approved request: posts the withdrawal
 * (the balance trigger deducts it), links the transaction and marks the request
 * released. Notifies the member and the finance team.
 */
export async function releaseWithdrawal(id: string): Promise<ActionResult> {
  const gate = await requireModule("savings", "approve");
  if (gate) return gate;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const db = createAdminClient() ?? supabase;

  const { data: req } = await db
    .from("savings_withdrawal_requests")
    .select("id, tenant_id, account_id, profile_id, amount, status")
    .eq("id", id)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "approved")
    return { ok: false, error: "Only approved requests can be released." };

  const { data: acct } = await db
    .from("savings_accounts")
    .select("balance")
    .eq("id", req.account_id)
    .maybeSingle();
  if (!acct) return { ok: false, error: "Account not found." };
  if (Number(req.amount) > Number(acct.balance))
    return { ok: false, error: "Insufficient balance to release this withdrawal." };

  // Post the withdrawal; the trigger debits the account balance.
  const { data: txn, error: txErr } = await db
    .from("savings_transactions")
    .insert({
      tenant_id: req.tenant_id,
      account_id: req.account_id,
      kind: "withdrawal",
      amount: req.amount,
      note: "Approved withdrawal",
    })
    .select("id")
    .maybeSingle();
  if (txErr) return { ok: false, error: txErr.message };

  const { error } = await db
    .from("savings_withdrawal_requests")
    .update({
      status: "released",
      released_by: user?.id ?? null,
      released_at: new Date().toISOString(),
      transaction_id: txn?.id ?? null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Notify the member and the finance team that funds were released.
  const adminForIds = createAdminClient();
  const financeIds = adminForIds
    ? await financeApproverIds(adminForIds, req.tenant_id as string)
    : [];
  await notifyUsers({
    tenantId: req.tenant_id as string,
    profileIds: [req.profile_id as string, ...financeIds],
    category: "general",
    title: "Savings withdrawal released",
    body: "The approved savings withdrawal has been released and deducted from the account.",
    url: "/savings?view=mine",
  });
  rev();
  return { ok: true };
}
