import Link from "next/link";
import { AlertTriangle, ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getDeadlineBoard, type DeadlineRow } from "@/lib/performance/status-report";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Every deadline in the process, on one page.
 *
 * Until now a deadline could only be seen by opening the cycle it belonged to
 * and reading the workflow designer, one stage at a time — so nobody could
 * answer "what is due this month" without checking each cycle by hand.
 */
export default async function DeadlinesPage() {
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">Process deadlines are for HR and administrators.</p>
        <Link href="/performance" className="text-sm font-medium text-primary hover:underline">
          ← Back to performance
        </Link>
      </div>
    );
  }

  const board = await getDeadlineBoard();
  const overdue = board.rows.filter((r) => r.overdue > 0);
  const soon = board.rows.filter((r) => r.overdue === 0 && r.daysAway >= 0 && r.daysAway <= 14 && r.pending > 0);
  const later = board.rows.filter((r) => !overdue.includes(r) && !soon.includes(r));

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/performance"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Performance
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Process deadlines</h1>
        <p className="text-muted-foreground">
          Every stage deadline across live cycles, with how many people are still standing behind
          each one. Today is {board.today}.
        </p>
      </div>

      {board.cyclesWithoutWorkflow.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {board.cyclesWithoutWorkflow.join(", ")} {board.cyclesWithoutWorkflow.length === 1 ? "runs" : "run"} no
          configured workflow, so only the goal-setting date below applies. Give the cycle a
          template in performance settings and every stage gets its own deadline.
        </p>
      )}

      {board.rows.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          No live cycle has a workflow template or a goal-setting date, so there is nothing due.
        </p>
      ) : (
        <div className="space-y-5">
          <DeadlineGroup
            title="Past due"
            caption="People are still standing behind these."
            rows={overdue}
            tone="bad"
          />
          <DeadlineGroup
            title="Due within a fortnight"
            caption="Warn the owners before these land."
            rows={soon}
            tone="warn"
          />
          <DeadlineGroup title="Everything else" caption="The rest of the calendar." rows={later} />
        </div>
      )}
    </div>
  );
}

function DeadlineGroup({
  title,
  caption,
  rows,
  tone,
}: {
  title: string;
  caption: string;
  rows: DeadlineRow[];
  tone?: "bad" | "warn";
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2
          className={cn(
            "text-sm font-semibold uppercase tracking-wide",
            tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-700" : "text-muted-foreground",
          )}
        >
          {title} ({rows.length})
        </h2>
        <span className="text-xs text-muted-foreground">{caption}</span>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 pl-3 pr-2 font-medium">Due</th>
              <th className="py-2 pr-2 font-medium">Stage</th>
              <th className="py-2 pr-2 font-medium">Cycle</th>
              <th className="py-2 pr-2 font-medium">Waiting on</th>
              <th className="py-2 pr-3 text-right font-medium">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={`${r.cycleId}-${r.stageKey}`}>
                <td className="py-2 pl-3 pr-2 tabular-nums">
                  {r.dueDate}
                  <span
                    className={cn(
                      "ml-2 text-xs",
                      r.daysAway < 0 ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {r.daysAway === 0
                      ? "today"
                      : r.daysAway < 0
                        ? `${Math.abs(r.daysAway)}d ago`
                        : `in ${r.daysAway}d`}
                  </span>
                </td>
                <td className="py-2 pr-2 font-medium">{r.stageLabel}</td>
                <td className="py-2 pr-2 text-muted-foreground">
                  {r.cycleName}
                  {r.cycleStatus !== "active" && (
                    <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[10px]">{r.cycleStatus}</span>
                  )}
                </td>
                <td className="py-2 pr-2 text-muted-foreground">{r.ownerLabel}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {r.pending === 0 ? (
                    <span className="text-muted-foreground">all done</span>
                  ) : (
                    <span className={cn(r.overdue > 0 && "font-medium text-destructive")}>
                      {r.pending}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
