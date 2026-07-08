"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import { notifyUsers } from "@/lib/notify";
import type { ActionResult } from "@/types/actions";

const rev = () => revalidatePath("/performance/appraisals");

async function uid(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Is `me` the appraisal delegate the given manager nominated? */
async function isDelegateOf(managerId: string | null, me: string): Promise<boolean> {
  if (!managerId || managerId === me) return false;
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("appraisal_delegate_id")
    .eq("id", managerId)
    .maybeSingle();
  return (data?.appraisal_delegate_id ?? null) === me;
}

/** Manager (or HR) opens a Performance Improvement Plan for an employee. */
export async function createPip(input: {
  employeeId: string;
  concern: string;
  expectations?: string;
  support?: string;
  reviewDate?: string;
}): Promise<ActionResult> {
  const me = await uid();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (!input.concern?.trim()) return { ok: false, error: "Describe the performance concern." };
  const supabase = createClient();
  const { data: emp } = await supabase
    .from("profiles")
    .select("id, manager_id, tenant_id")
    .eq("id", input.employeeId)
    .maybeSingle();
  if (!emp) return { ok: false, error: "Employee not found." };

  const access = await getAccess();
  const isHr = access.isHr || access.isAdmin || access.isSystemAdmin;
  const isMgr =
    emp.manager_id === me || (await isDelegateOf((emp.manager_id as string | null) ?? null, me));
  if (!isHr && !isMgr) {
    return { ok: false, error: "Only the employee's manager or HR can open a PIP." };
  }

  const { error } = await supabase.from("appraisal_pips").insert({
    tenant_id: emp.tenant_id,
    profile_id: emp.id,
    manager_id: (emp.manager_id as string | null) ?? null,
    concern: input.concern.trim(),
    expectations: input.expectations?.trim() || null,
    support: input.support?.trim() || null,
    review_date: input.reviewDate || null,
    created_by: me,
  });
  if (error) return { ok: false, error: error.message };
  await notifyUsers({
    tenantId: emp.tenant_id as string,
    profileIds: [emp.id as string],
    category: "general",
    title: "Performance improvement plan opened",
    body: "A performance improvement plan was opened with you — review it with your manager.",
    url: "/performance/appraisals",
  });
  rev();
  return { ok: true };
}

/** Manager (or HR) records the outcome/status of a PIP. RLS gates write access. */
export async function setPipStatus(input: {
  pipId: string;
  status: "open" | "met" | "not_met" | "cancelled";
  outcome?: string;
}): Promise<ActionResult> {
  const me = await uid();
  if (!me) return { ok: false, error: "You're not signed in." };
  const supabase = createClient();
  const patch: Record<string, unknown> = { status: input.status };
  if (input.outcome !== undefined) patch.outcome = input.outcome.trim() || null;
  const { data, error } = await supabase
    .from("appraisal_pips")
    .update(patch)
    .eq("id", input.pipId)
    .select("profile_id, tenant_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "You can't update this PIP." };
  await notifyUsers({
    tenantId: data.tenant_id as string,
    profileIds: [data.profile_id as string],
    category: "general",
    title: "Performance improvement plan updated",
    body: `Your performance improvement plan was marked “${input.status.replace("_", " ")}”.`,
    url: "/performance/appraisals",
  });
  rev();
  return { ok: true };
}
