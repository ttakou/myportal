import "server-only";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/supabase/row-helpers";
import type {
  Appraisal,
  AppraisalCycle,
  AppraisalEvent,
  AppraisalGoal,
} from "@/types/appraisal";

const APPRAISAL_SELECT =
  "id, cycle_id, employee_id, manager_id, stage, status, overall_rating," +
  " employee_summary, manager_summary, discussion_date, discussion_notes," +
  " acknowledged_at, employee_agreed, employee_ack_comment," +
  " cycle:appraisal_cycles(name)," +
  " employee:profiles!employee_id(full_name)," +
  " manager:profiles!manager_id(full_name)";

function mapAppraisal(r: Record<string, any>): Appraisal {
  return {
    id: r.id,
    cycle_id: r.cycle_id,
    cycle_name: one<{ name?: string }>(r.cycle)?.name ?? null,
    employee_id: r.employee_id,
    employee_name: one<{ full_name?: string }>(r.employee)?.full_name ?? null,
    manager_id: r.manager_id ?? null,
    manager_name: one<{ full_name?: string }>(r.manager)?.full_name ?? null,
    stage: r.stage,
    status: r.status,
    overall_rating: r.overall_rating ?? null,
    employee_summary: r.employee_summary ?? null,
    manager_summary: r.manager_summary ?? null,
    discussion_date: r.discussion_date ?? null,
    discussion_notes: r.discussion_notes ?? null,
    acknowledged_at: r.acknowledged_at ?? null,
    employee_agreed: r.employee_agreed ?? null,
    employee_ack_comment: r.employee_ack_comment ?? null,
    goals: [],
    events: [],
  };
}

/** The tenant's active cycle (or the most recent one). */
export async function getActiveCycle(): Promise<AppraisalCycle | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisal_cycles")
    .select("id, name, year, period_start, period_end, goal_setting_deadline, status, created_at")
    .order("status", { ascending: true }) // 'active' sorts before 'draft'/'closed'? no — filter instead
    .order("year", { ascending: false })
    .limit(20);
  const rows = (data ?? []) as AppraisalCycle[];
  return rows.find((c) => c.status === "active") ?? rows[0] ?? null;
}

/** All cycles for the HR console. */
export async function getCycles(): Promise<AppraisalCycle[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisal_cycles")
    .select("id, name, year, period_start, period_end, goal_setting_deadline, status, created_at")
    .order("year", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []) as AppraisalCycle[];
}

/** The signed-in employee's appraisal for a cycle, with goals + events. */
export async function getMyAppraisal(cycleId: string): Promise<Appraisal | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("appraisals")
    .select(APPRAISAL_SELECT)
    .eq("cycle_id", cycleId)
    .eq("employee_id", user.id)
    .maybeSingle();
  if (!data) return null;
  const appraisal = mapAppraisal(data as Record<string, any>);
  await hydrate(appraisal);
  return appraisal;
}

/** Appraisals the signed-in manager owns (their direct reports). */
export async function getTeamAppraisals(cycleId: string): Promise<Appraisal[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("appraisals")
    .select(APPRAISAL_SELECT)
    .eq("cycle_id", cycleId)
    .eq("manager_id", user.id)
    .order("status");
  const list = (data ?? []).map((r) => mapAppraisal(r as Record<string, any>));
  await Promise.all(list.map((ap) => hydrate(ap)));
  return list;
}

/** Every appraisal in a cycle (HR monitoring; RLS limits to HR/admins). */
export async function getCycleAppraisals(cycleId: string): Promise<Appraisal[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("appraisals")
    .select(APPRAISAL_SELECT)
    .eq("cycle_id", cycleId)
    .order("status");
  return (data ?? []).map((r) => mapAppraisal(r as Record<string, any>));
}

/** One appraisal with goals + event history (for manager/HR detail). */
export async function getAppraisal(id: string): Promise<Appraisal | null> {
  const supabase = createClient();
  const { data } = await supabase.from("appraisals").select(APPRAISAL_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const appraisal = mapAppraisal(data as Record<string, any>);
  await hydrate(appraisal);
  return appraisal;
}

/** Load goals + events onto an appraisal. */
async function hydrate(appraisal: Appraisal): Promise<void> {
  const supabase = createClient();
  const [{ data: goals }, { data: events }] = await Promise.all([
    supabase
      .from("appraisal_goals")
      .select(
        "id, title, description, weight, deadline, success_indicator, employee_progress," +
          " employee_self_rating, employee_comment, manager_rating, manager_comment, at_risk, status",
      )
      .eq("appraisal_id", appraisal.id)
      .order("created_at"),
    supabase
      .from("appraisal_events")
      .select("id, stage, action, comment, created_at, actor:profiles!actor_id(full_name)")
      .eq("appraisal_id", appraisal.id)
      .order("created_at", { ascending: false }),
  ]);
  appraisal.goals = (goals ?? []) as unknown as AppraisalGoal[];
  appraisal.events = ((events ?? []) as Record<string, any>[]).map(
    (e): AppraisalEvent => ({
      id: e.id,
      actor_name: one<{ full_name?: string }>(e.actor)?.full_name ?? null,
      stage: e.stage ?? null,
      action: e.action,
      comment: e.comment ?? null,
      created_at: e.created_at,
    }),
  );
}
