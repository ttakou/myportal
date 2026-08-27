import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldX, UserCog } from "lucide-react";
import { getAppraisal } from "@/lib/appraisals";
import { getAccess } from "@/lib/auth";
import { proxyTrail } from "@/lib/performance/proxy";
import { STATUS_LABEL, type Appraisal } from "@/types/appraisal";
import { WorkflowSection } from "../../_components/workflow-section";
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

      <Suspense fallback={<div className="h-40 animate-pulse rounded-lg border bg-muted/30" />}>
        <WorkflowSection
          appraisalId={appraisal.id}
          heading={`${employeeName} — workflow`}
          partyNames={partyNames}
        />
      </Suspense>

      <ProxyManagerComment
        appraisalId={appraisal.id}
        employeeName={employeeName}
        managerName={appraisal.manager_name}
        initial={appraisal.manager_summary}
      />

      <Objectives appraisal={appraisal} />

      <Suspense fallback={null}>
        <AppraisalFormOutline appraisalId={appraisal.id} />
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
