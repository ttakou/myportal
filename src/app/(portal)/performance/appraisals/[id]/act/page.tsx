import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldX, UserCog, Users } from "lucide-react";
import { getAppraisal } from "@/lib/appraisals";
import { getAccess } from "@/lib/auth";
import { proxyTrail } from "@/lib/performance/proxy";
import { getManagerLine } from "@/lib/performance/team-line";
import { TeamLinePanel } from "../../_components/team-line-panel";
import { STATUS_LABEL, type Appraisal } from "@/types/appraisal";
import { WorkflowSection } from "../../_components/workflow-section";
import { AppraisalTabs } from "../../_components/my-appraisal-tabs";
import { AppraisalFormOutline } from "../../_components/appraisal-form-outline";
import { ProxyManagerComment } from "./proxy-manager-comment";

export const dynamic = "force-dynamic";

/**
 * One person's appraisal, opened by an administrator to act on their behalf.
 *
 * The HR console and the status report both list who is holding the process up,
 * and until now that was all they did — HR could see that a manager on rotation
 * had not signed off, and had nowhere to go about it. Clicking the name lands
 * here, where their outstanding step can be taken for them and the record says
 * who took it.
 *
 * The stand-in is confined to this appraisal: it is not a way to sign in as
 * somebody, and nothing outside the performance module is touched.
 */
export default async function ActForPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccess();

  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">
          Only HR and administrators can act on another person&apos;s appraisal.
        </p>
        <Link href="/performance" className="text-sm font-medium text-primary hover:underline">
          ← Back to performance
        </Link>
      </div>
    );
  }

  const appraisal = await getAppraisal(id);
  if (!appraisal) notFound();

  const employeeName = appraisal.employee_name ?? "this employee";
  const partyNames = {
    employee: appraisal.employee_name,
    manager: appraisal.manager_name,
    secondLevel: appraisal.second_level_name ?? null,
  };
  const stoodIn = proxyTrail(appraisal.events);

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/performance/status"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Status report
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          <UserCog className="h-6 w-6 text-amber-600" />
          Acting for {employeeName}
        </h1>
        <p className="text-muted-foreground">
          {appraisal.cycle_name ?? "Appraisal"} · {STATUS_LABEL[appraisal.status]}
          {appraisal.manager_name ? ` · line manager ${appraisal.manager_name}` : ""}
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <UserCog className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          You are standing in on this one appraisal — not signed in as {employeeName}. Nothing
          outside the performance module is affected, and every step you take here records your
          name alongside the name of whoever the step belonged to.
        </span>
      </p>

      {/* The same two tabs the employee and the manager see, so standing in for
          somebody looks like the screen you are standing in on. The objectives
          were below the workflow and below their team, which put the thing a
          step is about further down the page than the button that takes it. */}
      <AppraisalTabs
        label={`${employeeName} — appraisal`}
        objectives={
          <div className="space-y-3">
            <Objectives appraisal={appraisal} />
            <ProxyManagerComment
              appraisalId={appraisal.id}
              employeeName={employeeName}
              managerName={appraisal.manager_name}
              initial={appraisal.manager_summary}
            />
            <Suspense fallback={null}>
              <AppraisalFormOutline appraisalId={appraisal.id} />
            </Suspense>
          </div>
        }
        workflow={
          <Suspense fallback={<div className="h-40 animate-pulse rounded-lg border bg-muted/30" />}>
            <WorkflowSection
              appraisalId={appraisal.id}
              heading={`${employeeName} — workflow`}
              partyNames={partyNames}
            />
          </Suspense>
        }
      />

      {/* Standing in for a line manager means doing their job, and their job is
          mostly their reports' reviews and sign-offs rather than their own
          appraisal. Outside the tabs: it is about them, not about this record.
          Self-hides for somebody who manages nobody. */}
      <Suspense fallback={null}>
        <TheirTeam
          managerId={appraisal.employee_id}
          managerName={employeeName}
          cycleId={appraisal.cycle_id}
        />
      </Suspense>

      {stoodIn.length > 0 && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Taken by somebody else</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Every step on this appraisal that was taken for the person it belonged to.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {stoodIn.map((e) => (
              <li key={e.id}>
                <span className="text-foreground">{e.action.replace(/_/g, " ")}</span>
                {e.actor_name ? ` · ${e.actor_name}` : ""}
                <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                  acting for {e.on_behalf_of_name}
                </span>{" "}
                · {new Date(e.created_at).toLocaleString("en-GB", { timeZone: "UTC" })}
                {e.comment ? ` — ${e.comment}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(appraisal.status === "completed" || appraisal.status === "closed") && (
        <Link
          href={`/performance/appraisals/${appraisal.id}/outcome`}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          View / print outcome
        </Link>
      )}
    </div>
  );
}

/**
 * The reports of the person being stood in for.
 *
 * Reaching only their own appraisal was the smaller half of the job: a line
 * manager owes a review, a comment and two sign-offs on every person under
 * them, and it is those that stall when the manager is off the rig. Each row
 * links to that report's own page, where the manager's step is taken for them
 * and recorded the same way.
 */
async function TheirTeam({
  managerId,
  managerName,
  cycleId,
}: {
  managerId: string;
  managerName: string;
  cycleId: string;
}) {
  const line = await getManagerLine(managerId, cycleId);
  if (line.members.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Users className="h-5 w-5 text-muted-foreground" />
        {managerName}&apos;s direct line ({line.members.length})
      </h2>
      <p className="text-sm text-muted-foreground">
        The reviews and sign-offs {managerName} owes. Open any of them to take the step for{" "}
        {managerName}; your name and theirs are recorded against it, exactly as here.
      </p>
      <TeamLinePanel line={line} canAct heading={null} />
    </section>
  );
}

/**
 * The person's objectives, as they stand.
 *
 * Read-only on purpose: the goals are the employee's own writing, and an
 * administrator taking a step for them should not be quietly rewriting what
 * they are being measured against.
 */
function Objectives({ appraisal }: { appraisal: Appraisal }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">Objectives</h2>
      {appraisal.goals.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No objectives recorded yet. These are the employee&apos;s own to write — if they cannot
          reach the system, the goals have to come from them before the phase can move.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-2 font-medium">Objective</th>
                <th className="py-1.5 pr-2 font-medium">Weight</th>
                <th className="py-1.5 pr-2 font-medium">Self rating</th>
                <th className="py-1.5 font-medium">Manager rating</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {appraisal.goals.map((g) => (
                <tr key={g.id}>
                  <td className="py-1.5 pr-2">{g.title}</td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {g.weight != null ? `${g.weight}%` : "—"}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">{g.employee_self_rating ?? "—"}</td>
                  <td className="py-1.5 tabular-nums">{g.manager_rating ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
