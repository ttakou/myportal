import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import { one } from "@/lib/supabase/row-helpers";
import type { Pip, PipData, PipStatus } from "@/types/pip";

export type { Pip, PipData, PipStatus } from "@/types/pip";
export { PIP_STATUS_LABEL } from "@/types/pip";

/** PIPs visible to the signed-in user (own + their team + HR/admin: all). */
export async function getPips(): Promise<PipData> {
  const supabase = createClient();
  const [{ data }, access, { data: auth }] = await Promise.all([
    supabase
      .from("appraisal_pips")
      .select(
        "id, profile_id, concern, expectations, support, start_date, review_date, status, outcome," +
          " employee:profiles!profile_id(full_name), manager:profiles!manager_id(full_name)",
      )
      .order("status")
      .order("created_at", { ascending: false }),
    getAccess(),
    supabase.auth.getUser(),
  ]);
  const me = auth.user?.id ?? null;
  const pips: Pip[] = ((data ?? []) as Record<string, any>[]).map((r) => ({
    id: r.id,
    profile_id: r.profile_id,
    employee_name: one<{ full_name?: string }>(r.employee)?.full_name ?? null,
    manager_name: one<{ full_name?: string }>(r.manager)?.full_name ?? null,
    concern: r.concern,
    expectations: r.expectations ?? null,
    support: r.support ?? null,
    start_date: r.start_date,
    review_date: r.review_date ?? null,
    status: r.status as PipStatus,
    outcome: r.outcome ?? null,
    is_own: r.profile_id === me,
  }));
  const isHr = access.isHr || access.isAdmin || access.isSystemAdmin;
  // A manager raises PIPs for their reports; surface the control if they have any
  // PIP they don't own (i.e. they manage someone) or they're HR.
  const canManage = isHr || pips.some((p) => !p.is_own);
  return { pips, canManage };
}
