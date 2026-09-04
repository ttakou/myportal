"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/ui/search-select";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import { cn } from "@/lib/utils";
import {
  filterReportingLines,
  rowIssues,
  summariseReportingLines,
  type ReportingLineFilter,
  type ReportingLineRow,
} from "@/lib/performance/reporting-lines";
import type { Colleague } from "@/lib/performance/status-report";
import { setStaffLineManager } from "../actions";

const FILTERS: { key: ReportingLineFilter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "no_manager", label: "No line manager" },
  { key: "no_reviewer", label: "No reviewer this cycle" },
  { key: "differs", label: "Reviewer differs" },
];

const ISSUE_LABEL: Record<string, string> = {
  no_manager: "no line manager",
  no_reviewer: "appraisal names no reviewer",
  differs: "reviewer is not the line manager",
};

/**
 * Line manager per member of staff, in one place.
 *
 * The reporting line was set in the admin centre one person at a time, on a
 * screen that shows nothing about appraisals, and the reviewer on the status
 * report, which shows nothing about the reporting line. Nobody had the whole
 * workforce in one table with the two side by side. Here it is, with what is
 * wrong called out per row and fixable on the row.
 */
export function LineManagersPanel({
  rows,
  colleagues,
  cycleId,
  cycleName,
}: {
  rows: ReportingLineRow[];
  colleagues: Colleague[];
  cycleId: string | null;
  cycleName: string | null;
}) {
  const [filter, setFilter] = useState<ReportingLineFilter>("all");
  const [query, setQuery] = useState("");
  const summary = useMemo(() => summariseReportingLines(rows), [rows]);
  const shown = useMemo(() => filterReportingLines(rows, filter, query), [rows, filter, query]);
  const { count, hasMore, remaining, showMore, sentinelRef } = useProgressiveReveal(shown.length);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Stat label="Staff" value={summary.staff} />
        <Stat label="No line manager" value={summary.noManager} tone={summary.noManager > 0 ? "bad" : undefined} />
        <Stat label="No reviewer this cycle" value={summary.noReviewer} tone={summary.noReviewer > 0 ? "bad" : undefined} />
        <Stat label="Reviewer differs" value={summary.differs} tone={summary.differs > 0 ? "warn" : undefined} />
        <Stat label="Consistent" value={summary.consistent} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              filter === f.key ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
            )}
          >
            {f.label}
          </button>
        ))}
        <label className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, department, manager"
            className="rounded-md border bg-background py-1.5 pl-8 pr-3 text-sm"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 pl-3 pr-2 font-medium">Staff</th>
              <th className="py-2 pr-2 font-medium">Line manager</th>
              <th className="py-2 pr-3 font-medium">
                Reviewer{cycleName ? ` · ${cycleName}` : ""}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.slice(0, count).map((r) => (
              <StaffRow key={r.profileId} row={r} colleagues={colleagues} cycleId={cycleId} />
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-muted-foreground">
                  Nobody matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ShowMore
        ref={sentinelRef}
        hasMore={hasMore}
        remaining={remaining}
        onClick={showMore}
        label="Show more staff"
      />
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" | "warn" }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
      {label}:{" "}
      <span
        className={cn(
          "font-semibold",
          tone === "bad" && "text-destructive",
          tone === "warn" && "text-amber-700",
        )}
      >
        {value}
      </span>
    </span>
  );
}

function StaffRow({
  row,
  colleagues,
  cycleId,
}: {
  row: ReportingLineRow;
  colleagues: Colleague[];
  cycleId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [managerId, setManagerId] = useState(row.managerId ?? "");
  const [alsoReviewer, setAlsoReviewer] = useState(true);

  // Nobody manages themselves, so keep the person out of their own list.
  const options = useMemo(
    () => colleagues.filter((c) => c.id !== row.profileId),
    [colleagues, row.profileId],
  );

  const issues = rowIssues(row);
  const changed = managerId !== (row.managerId ?? "");
  // Offer to carry the choice onto the appraisal whenever it would change the
  // reviewer: a different person, or a reviewer slot that is empty.
  const canSyncAppraisal = !!row.appraisalId && !!managerId && managerId !== row.reviewerId;

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setStaffLineManager({
        profileId: row.profileId,
        managerId: managerId || null,
        cycleId,
        updateAppraisal: canSyncAppraisal && alsoReviewer,
      });
      if (!res.ok) {
        setError(res.error ?? "Couldn't save.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <tr className={cn(issues.length > 0 && "bg-amber-50/40")}>
      <td className="py-2 pl-3 pr-2 align-top">
        <p className="font-medium">{row.name}</p>
        <p className="text-xs text-muted-foreground">
          {[row.jobTitle, row.department].filter(Boolean).join(" · ") || "—"}
        </p>
        {issues.length > 0 && (
          <p className="mt-0.5 text-xs text-amber-800">
            {issues.map((i) => ISSUE_LABEL[i]).join(" · ")}
          </p>
        )}
      </td>
      <td className="py-2 pr-2 align-top">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-56">
            <SearchSelect
              value={managerId}
              onChange={(v) => {
                setManagerId(v ?? "");
                setSaved(false);
              }}
              options={options}
              getOptionValue={(c) => c.id}
              getOptionLabel={(c) => c.name}
              placeholder="No line manager"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || (!changed && !(canSyncAppraisal && alsoReviewer))}
            onClick={save}
          >
            Save
          </Button>
          {saved && <span className="text-xs text-emerald-700">Saved.</span>}
        </div>
        {canSyncAppraisal && (
          <label className="mt-1.5 flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={alsoReviewer}
              disabled={pending}
              onChange={(e) => setAlsoReviewer(e.target.checked)}
              className="mt-0.5"
            />
            <span>Also make them the reviewer on this cycle&apos;s appraisal.</span>
          </label>
        )}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
      <td className="py-2 pr-3 align-top text-muted-foreground">
        {row.appraisalId ? (
          row.reviewerName ?? <span className="text-amber-800">nobody</span>
        ) : (
          <span className="text-xs">Not in this cycle</span>
        )}
      </td>
    </tr>
  );
}
