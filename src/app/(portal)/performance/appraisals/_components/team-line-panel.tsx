import Link from "next/link";
import { AlertTriangle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_ROLE_LABEL } from "@/types/workflow";
import type { TeamLine } from "@/lib/performance/team-line";

/**
 * A manager's direct line, each person with the phase they are in.
 *
 * The panel below this one lists appraisals, so anybody without one was absent
 * from the screen entirely — a manager whose reports are not in the cycle was
 * told they had nobody to review, which reads as "you have no reports". Here
 * the line comes first and the appraisal is overlaid, so a missing one is
 * stated rather than silently dropping the person.
 */
export function TeamLinePanel({
  line,
  canAct,
  heading = "My direct line",
}: {
  line: TeamLine;
  canAct: boolean;
  /** Null when the caller supplies its own heading. */
  heading?: string | null;
}) {
  if (line.members.length === 0) return null;

  return (
    <section className="space-y-2">
      {heading !== null && (
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="h-5 w-5 text-muted-foreground" />
          {heading} ({line.members.length})
        </h2>
      )}

      {line.withoutAppraisal > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {line.withoutAppraisal} of them {line.withoutAppraisal === 1 ? "holds" : "hold"} no
          appraisal in this cycle, so there is no phase to be in and nothing to review. They are
          in the reporting line but not among the cycle&apos;s participants — HR adds people when
          the cycle is launched.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 pl-3 pr-2 font-medium">Report</th>
              <th className="py-2 pr-2 font-medium">Phase</th>
              <th className="py-2 pr-2 font-medium">Step</th>
              <th className="py-2 pr-3 font-medium">Waiting on</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {line.members.map((m) => (
              <tr key={m.profileId}>
                <td className="py-2 pl-3 pr-2">
                  <span className="font-medium">{m.name}</span>
                  {m.jobTitle && (
                    <span className="ml-2 text-xs text-muted-foreground">{m.jobTitle}</span>
                  )}
                </td>
                <td className="py-2 pr-2">
                  {m.appraisalId === null ? (
                    <span className="text-xs text-muted-foreground">Not in this cycle</span>
                  ) : m.finished ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-800">
                      Complete
                    </span>
                  ) : m.phase ? (
                    <span className="inline-flex items-center gap-1.5">
                      {m.phaseNumber && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {m.phaseNumber}/{m.phaseCount}
                        </span>
                      )}
                      <span className="font-medium">{m.phase}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {line.hasWorkflow ? "—" : "No workflow on this cycle"}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-2 text-muted-foreground">
                  {/* The phase already names itself, so the step reads better
                      without repeating it. */}
                  {m.stageLabel
                    ? m.stageLabel.replace(/^.*?[—–-]\s*/, "")
                    : m.appraisalId
                      ? "—"
                      : ""}
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={cn(
                      "text-muted-foreground",
                      m.owner === "line_manager" && "font-medium text-foreground",
                    )}
                  >
                    {m.owner ? STAGE_ROLE_LABEL[m.owner] : ""}
                  </span>
                  {canAct && m.appraisalId && (
                    <Link
                      href={`/performance/appraisals/${m.appraisalId}/act`}
                      className="ml-3 text-xs text-primary underline underline-offset-2 hover:no-underline"
                    >
                      Open
                    </Link>
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
