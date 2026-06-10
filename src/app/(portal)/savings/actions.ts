"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";

export interface ActionResult {
  ok: boolean;
  error?: string;
}
const rev = () => revalidatePath("/savings");
async function admin() {
  return isAdminRole(await getCurrentRole());
}
async function tenantId(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  return data?.id as string | undefined;
}

/** Create a savings account for a member if they don't have one. */
export async function ensureAccount(profileId: string): Promise<ActionResult> {
  if (!(await admin())) return { ok: false, error: "Not authorized." };
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
  if (!(await admin())) return { ok: false, error: "Not authorized." };
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
  if (!(await admin())) return { ok: false, error: "Not authorized." };
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
  rev();
  return { ok: true };
}

export async function recordRepayment(loanId: string, amount: number): Promise<ActionResult> {
  if (!(await admin())) return { ok: false, error: "Not authorized." };
  if (!(amount > 0)) return { ok: false, error: "Amount must be positive." };
  const supabase = createClient();
  const t = await tenantId(supabase);
  if (!t) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase
    .from("loan_repayments")
    .insert({ tenant_id: t, loan_id: loanId, amount });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
