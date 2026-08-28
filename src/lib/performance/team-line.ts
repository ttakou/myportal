import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCyclePhaseStages } from "./house-template";
import { memberPhase, type MemberPhase } from "./member-phase";
import type { EmployeeContext } from "@/lib/workflow-engine";

export interface TeamLineMember extends MemberPhase {
  profileId: string;
  name: string;
  jobTitle: string | null;
  /** Null when this report holds no appraisal in the cycle. */
  appraisalId: string | null;
  /** False when the appraisal names no reviewer, so nobody owns its steps. */
  reviewerAssigned: boolean;
}

export interface TeamLine {
  members: TeamLineMember[];
  /** Reports in the line who hold no appraisal — they are not participants. */
  withoutAppraisal: number;
  /** In the cycle, but with no reviewer on the appraisal to act on it. */
  withoutReviewer: number;
  /** True when the cycle runs a workflow, so a phase can be named at all. */
  hasWorkflow: boolean;
}

/**
 * A manager's direct line for one cycle, each person with the phase they are in.
 *
 * The team panel listed appraisals, so a report with no appraisal in the cycle
 * simply was not there — and a manager whose whole line sits outside the cycle
 * was told they had nobody to review, which reads as "you have no reports". The
 * line comes from the reporting structure; the appraisal is overlaid onto it,
 * and its absence is something to say rather than a reason to say nothing.
 *
 * The phase is each person's own, read from their completed steps: the cycle
 * may be open on mid-year while this report is still in goal setting, and that
 * gap is the thing worth seeing.
 */
export async function getTeamLine(cycleId: string | null): Promise<TeamLine> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY_LINE;

  // The same manager set the appraisal queue uses: me, plus anybody who
  // nominated me to cover for them.
  const { data: delegators } = await supabase
    .from("profiles")
    .select("id")
    .eq("appraisal_delegate_id", user.id);
  const managerIds = [user.id, ...((delegators ?? []) as { id: string }[]).map((d) => d.id)];
  return lineFor(managerIds, cycleId);
}

/**
 * The same line, for somebody else.
 *
 * Standing in for a line manager means doing their job, and their job is mostly
 * their reports' reviews and sign-offs rather than their own appraisal. An
 * administrator opening a manager's appraisal to act for them could reach only
 * that one record, which is the smaller half of what the manager owes.
 */
export async function getManagerLine(
  managerId: string,
  cycleId: string | null,
): Promise<TeamLine> {
  return lineFor([managerId], cycleId);
}

const EMPTY_LINE: TeamLine = {
  members: [],
  withoutAppraisal: 0,
  withoutReviewer: 0,
  hasWorkflow: false,
};

/** Everybody reporting to any of `managerIds`, with each one's phase. */
async function lineFor(managerIds: string[], cycleId: string | null): Promise<TeamLine> {
  const empty = EMPTY_LINE;
  const supabase = createClient();
  if (managerIds.length === 0) return empty;

  const { data: reports } = await supabase
    .from("profiles")
    .select("id, full_name, job_title")
    .in("manager_id", managerIds)
    .eq("is_active", true)
    .order("full_name");
  const line = (reports ?? []) as { id: string; full_name: string | null; job_title: string | null }[];

  type Row = {
    id: string;
    employee_id: string;
    manager_id: string | null;
    completed_stages: unknown;
    employee?: { full_name?: string; job_title?: string | null } | { full_name?: string }[] | null;
  };
  const SELECT =
    "id, employee_id, manager_id, completed_stages, employee:profiles!employee_id(full_name, job_title)";

  // Two ways in, and both are needed.
  //
  // By employee, because the reporting line is the question being asked: an
  // appraisal naming no reviewer — and most of them name none — matched
  // nothing when the lookup went by manager alone, so a person sitting in the
  // cycle was reported as not being in it.
  //
  // By manager, because a transfer can leave somebody reviewing a person who
  // no longer reports to them, and that work is still theirs.
  const lineIds = line.map((p) => p.id);
  const [byEmp, byMgr] = cycleId
    ? await Promise.all([
        lineIds.length
          ? supabase.from("appraisals").select(SELECT).eq("cycle_id", cycleId).in("employee_id", lineIds)
          : Promise.resolve({ data: [] }),
        supabase.from("appraisals").select(SELECT).eq("cycle_id", cycleId).in("manager_id", managerIds),
      ])
    : [{ data: [] }, { data: [] }];

  const rows: Row[] = [];
  for (const r of [...((byEmp.data ?? []) as unknown as Row[]), ...((byMgr.data ?? []) as unknown as Row[])]) {
    if (!rows.some((x) => x.id === r.id)) rows.push(r);
  }
  const byEmployee = new Map(rows.map((r) => [r.employee_id, r]));

  // Everybody in the line, plus anybody they review who is not in it.
  const people = [...line];
  for (const r of rows) {
    if (people.some((p) => p.id === r.employee_id)) continue;
    const emp = Array.isArray(r.employee) ? r.employee[0] : r.employee;
    people.push({
      id: r.employee_id,
      full_name: emp?.full_name ?? null,
      job_title: (emp as { job_title?: string | null })?.job_title ?? null,
    });
  }
  if (people.length === 0) return empty;

  const stages = cycleId ? await getCyclePhaseStages(cycleId) : [];
  // Stage conditions can turn on whether the person manages anybody; nobody in
  // a direct line is being asked a management-grade question here, so the
  // context stays plain rather than guessed at.
  const ctx: EmployeeContext = { department: null, isManager: false, isManagementGrade: false };

  const members: TeamLineMember[] = people.map((p) => {
    const row = byEmployee.get(p.id);
    const completed = Array.isArray(row?.completed_stages) ? (row.completed_stages as string[]) : [];
    return {
      profileId: p.id,
      name: p.full_name ?? "—",
      jobTitle: p.job_title ?? null,
      appraisalId: row?.id ?? null,
      reviewerAssigned: row?.manager_id != null,
      ...(row ? memberPhase(stages, ctx, completed) : memberPhase([], ctx, [])),
    };
  });

  return {
    members,
    withoutAppraisal: members.filter((m) => m.appraisalId === null).length,
    withoutReviewer: members.filter((m) => m.appraisalId !== null && !m.reviewerAssigned).length,
    hasWorkflow: stages.length > 0,
  };
}
