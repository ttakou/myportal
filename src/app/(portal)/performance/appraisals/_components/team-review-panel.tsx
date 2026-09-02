"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useStatusTransition } from "@/components/activity";
import { ChevronDown, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppraisalTabs } from "./my-appraisal-tabs";
import { ReportReview } from "./report-review";
import type { PersonActivity } from "@/lib/performance/goal-activity";
import { reviewControls } from "@/lib/performance/review-controls";
import { LazySelect } from "@/components/ui/lazy-select";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import { STAGE_LABEL, STATUS_LABEL, type Appraisal, type Colleague } from "@/types/appraisal";
import { setAppraisalDelegate } from "../actions";

export function TeamReviewPanel({
  appraisals,
  colleagues = [],
  currentDelegate = null,
  workflowByAppraisal,
  activityByAppraisal,
}: {
  appraisals: Appraisal[];
  colleagues?: Colleague[];
  currentDelegate?: { id: string; name: string | null } | null;
  /**
   * Each report's workflow timeline, rendered on the server and handed in so
   * it can sit behind a tab on their own card rather than in a separate list
   * further down the page.
   */
  workflowByAppraisal?: Record<string, ReactNode>;
  /**
   * What each report posted on Continuous this cycle. A manager reviewing
   * somebody could not see any of it: the updates and the recognition were
   * written to a table the appraisal never queried.
   */
  activityByAppraisal?: Record<string, PersonActivity>;
}) {
  const { count, hasMore, remaining, showMore, sentinelRef } = useProgressiveReveal(
    appraisals.length,
  );
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">My team&apos;s appraisals</h2>
        <DelegateControl colleagues={colleagues} current={currentDelegate} />
      </div>
      <div className="space-y-3">
        {appraisals.slice(0, count).map((a) => (
          <TeamRow
            key={a.id}
            appraisal={a}
            workflow={workflowByAppraisal?.[a.id]}
            activity={activityByAppraisal?.[a.id]}
          />
        ))}
      </div>
      <ShowMore
        ref={sentinelRef}
        hasMore={hasMore}
        remaining={remaining}
        onClick={showMore}
        label="Show more reports"
      />
    </section>
  );
}

/** Nominate a colleague to cover this manager's appraisals while they're away. */
function DelegateControl({
  colleagues,
  current,
}: {
  colleagues: Colleague[];
  current: { id: string; name: string | null } | null;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function set(id: string | null) {
    setError(null);
    startTransition(async () => {
      const res = await setAppraisalDelegate(id);
      if (!res.ok) setError(res.error ?? "Couldn't update delegate.");
      else setOpen(false);
    });
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
      >
        <UserCog className="h-3.5 w-3.5" />
        {current ? `Delegate: ${current.name ?? "—"}` : "Set a delegate"}
      </button>
      {open && (
        <div className="mt-1 flex items-center gap-2">
          <LazySelect
            value={current?.id ?? null}
            options={colleagues}
            getOptionValue={(c) => c.id}
            getOptionLabel={(c) => `${c.full_name ?? "—"}${c.department ? ` · ${c.department}` : ""}`}
            placeholder="No delegate"
            disabled={pending}
            onChange={(v) => set(v)}
            className="rounded-md border bg-background px-2 py-1 text-xs"
          />
        </div>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function TeamRow({
  appraisal: a,
  workflow,
  activity,
}: {
  appraisal: Appraisal;
  workflow?: ReactNode;
  activity?: PersonActivity;
}) {
  const [open, setOpen] = useState(false);
  const { actionNeeded } = reviewControls({
    stage: a.stage,
    status: a.status,
    goalsReadOnly: a.goalsReadOnly,
    goalCount: a.goals.length,
  });

  // The card's body is the same component the stand-in page renders, so a
  // manager and whoever covers for them see one thing. A plain element, not a
  // nested component: declaring one inside the render body gives React a new
  // type on every keystroke and remounts the subtree, which is how a comment
  // field once lost focus after each letter.
  const details = <ReportReview appraisal={a} activity={activity} canReview />;

  return (
    <div id={`appraisal-${a.id}`} className="scroll-mt-24 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{a.employee_name || "—"}</span>
          {actionNeeded && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-700">
              Action needed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(a.status === "completed" || a.status === "closed") && (
            <Link
              href={`/performance/appraisals/${a.id}/outcome`}
              className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent"
            >
              Outcome
            </Link>
          )}
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {STAGE_LABEL[a.stage]} · {STATUS_LABEL[a.status]}
            {a.final_score != null ? ` · ${a.final_score}% · ${a.rating_label ?? ""}` : ""}
          </span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent"
          >
            {open ? "Hide" : "Show details"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {!open && (
        <p className="mt-2 text-xs text-muted-foreground">
          {a.goals.length} goal{a.goals.length === 1 ? "" : "s"}
          {a.employee_summary ? " · self-assessment submitted" : ""}
          {actionNeeded ? " · needs your attention — open to act" : ""}
        </p>
      )}

      {open &&
        (workflow ? (
          <div className="mt-3">
            <AppraisalTabs
              label={`${a.employee_name ?? "Report"} — appraisal`}
              objectives={details}
              workflow={workflow}
            />
          </div>
        ) : (
          details
        ))}
    </div>
  );
}
