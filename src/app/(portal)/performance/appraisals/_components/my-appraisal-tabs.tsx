"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tab = "objectives" | "workflow";

/**
 * An appraisal, split in two.
 *
 * The workflow is fourteen steps long, and printed above the objectives it
 * pushed the actual work below the fold on every visit. The objectives are what
 * somebody comes here to do, so they open first; the workflow is there when
 * they want to know where things stand.
 *
 * Used for a person's own appraisal and for each of a manager's reports, so the
 * two read the same way.
 *
 * Both panels are rendered on the server and handed in, so switching tabs costs
 * nothing and neither is re-fetched.
 */
export function AppraisalTabs({
  objectives,
  workflow,
  workflowSummary,
  label = "Appraisal",
}: {
  objectives: ReactNode;
  workflow: ReactNode;
  /** Shown on the workflow tab itself, so progress is visible without opening it. */
  workflowSummary?: string | null;
  /** Names the tab strip for screen readers — several can share a page. */
  label?: string;
}) {
  const [tab, setTab] = useState<Tab>("objectives");

  const tabs: { key: Tab; label: string; note?: string | null }[] = [
    { key: "objectives", label: "Objectives" },
    { key: "workflow", label: "Workflow", note: workflowSummary },
  ];

  return (
    <div className="space-y-3">
      <nav className="flex flex-wrap gap-1 border-b" aria-label={label}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium transition-colors",
              t.key === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
            )}
          >
            {t.label}
            {t.note && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t.note}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Both stay mounted: hiding rather than unmounting keeps a half-typed
          objective intact when somebody checks the workflow mid-edit. */}
      <div className={cn(tab === "objectives" ? "block" : "hidden")}>{objectives}</div>
      <div className={cn(tab === "workflow" ? "block" : "hidden")}>{workflow}</div>
    </div>
  );
}
