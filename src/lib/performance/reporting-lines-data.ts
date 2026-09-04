import "server-only";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/row-helpers";
import { sortReportingLines, type ReportingLineRow } from "./reporting-lines";

/**
 * Every member of staff in the workflow, with their reporting line and, when
 * they hold an appraisal in the cycle, its reviewer.
 *
 * The roster is the authority on who is in the workflow — the same reading the
 * status report and the HR console use — so this table and those agree about
 * who counts.
 */
export async function getReportingLines(cycleId: string | null): Promise<ReportingLineRow[]> {
  const supabase = createClient();

  const [{ data: roster }, { data: appraisals }] = await Promise.all([
    supabase.rpc("appraisable_profiles"),
    cycleId
      ? supabase
          .from("appraisals")
          .select("id, employee_id, manager_id, manager:profiles!manager_id(full_name)")
          .eq("cycle_id", cycleId)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const ids = ((roster ?? []) as { id: string }[]).map((p) => p.id);
  if (ids.length === 0) return [];

  const { data: people } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, job_title, manager_id, manager:profiles!manager_id(full_name)")
    .in("id", ids);

  const byEmployee = new Map(
    ((appraisals ?? []) as Record<string, unknown>[]).map((a) => [
      String(a.employee_id),
      {
        id: String(a.id),
        reviewerId: (a.manager_id as string | null) ?? null,
        reviewerName:
          one<{ full_name?: string }>(a.manager as { full_name?: string } | null)?.full_name ?? null,
      },
    ]),
  );

  const rows = ((people ?? []) as Record<string, unknown>[]).map((p): ReportingLineRow => {
    const appraisal = byEmployee.get(String(p.id));
    return {
      profileId: String(p.id),
      name: (p.full_name as string | null) || (p.email as string | null) || "—",
      department: (p.department as string | null) ?? null,
      jobTitle: (p.job_title as string | null) ?? null,
      managerId: (p.manager_id as string | null) ?? null,
      managerName:
        one<{ full_name?: string }>(p.manager as { full_name?: string } | null)?.full_name ?? null,
      appraisalId: appraisal?.id ?? null,
      reviewerId: appraisal?.reviewerId ?? null,
      reviewerName: appraisal?.reviewerName ?? null,
    };
  });

  return sortReportingLines(rows);
}
