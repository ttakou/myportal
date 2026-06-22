import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { STAGE_LABEL, STATUS_LABEL, type DirectReport } from "@/types/appraisal";
import { cn } from "@/lib/utils";

/** Where a manager goes to act on a report — the report's appraisal record,
 *  deep-linked so it scrolls straight to the right row in the team panel. */
function actHref(r: DirectReport): string {
  return r.appraisal_id
    ? `/performance/appraisals#appraisal-${r.appraisal_id}`
    : "/performance/appraisals";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Status pill: amber when the manager must act, green when settled, grey
 *  while it sits with the employee / HR, dashed when not started yet. */
function StatusPill({ report: r }: { report: DirectReport }) {
  if (!r.status) {
    return (
      <span className="rounded-full border border-dashed px-2.5 py-1 text-xs font-medium text-muted-foreground">
        Not started
      </span>
    );
  }
  const settled = r.status === "completed" || r.status === "closed";
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium",
        r.needs_action
          ? "bg-amber-100 text-amber-800"
          : settled
            ? "bg-emerald-100 text-emerald-700"
            : "bg-muted text-muted-foreground",
      )}
    >
      {r.needs_action ? "Action needed" : STATUS_LABEL[r.status]}
    </span>
  );
}

/**
 * A manager's direct line on the performance dashboard: every direct report
 * with their appraisal state for the active cycle, and a one-click path to
 * review and act on each one. Hidden for people with no direct reports.
 */
export function DirectLinePanel({
  reports,
  cycleName,
}: {
  reports: DirectReport[];
  cycleName: string | null;
}) {
  if (reports.length === 0) return null;
  const toReview = reports.filter((r) => r.needs_action).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5 text-primary" /> My direct line
          </h2>
          <p className="text-sm text-muted-foreground">
            {cycleName
              ? `Your direct reports' performance · ${cycleName}`
              : "Your direct reports"}
            {toReview > 0 ? (
              <span className="font-medium text-amber-700">
                {" "}
                · {toReview} awaiting your review
              </span>
            ) : null}
          </p>
        </div>
        <Link
          href="/performance/appraisals"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Review team performance <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="divide-y overflow-hidden rounded-lg border bg-card">
        {reports.map((r) => (
          <Link
            key={r.profile_id}
            href={actHref(r)}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
          >
            {r.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.avatar_url}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {initials(r.name)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium leading-tight">{r.name}</p>
              {r.job_title && (
                <p className="truncate text-xs text-muted-foreground">{r.job_title}</p>
              )}
            </div>
            {r.stage && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {STAGE_LABEL[r.stage]}
              </span>
            )}
            <StatusPill report={r} />
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </section>
  );
}
