"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Search, UserCog } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/ui/search-select";
import { clearStrayAppraisals, setAppraisalReviewers } from "../../appraisals/actions";
import type { KeptAppraisal } from "@/lib/performance/stray-appraisals";
import { cn } from "@/lib/utils";
import {
  STAGE_STATE_LABEL,
  type ParticipantProgress,
} from "@/lib/performance/stage-progress";
import type {
  Colleague,
  ReviewerAssignment,
  StatusReport,
} from "@/lib/performance/status-report";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

type Filter = "all" | "late" | "open" | "done";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "late", label: "Running late" },
  { key: "open", label: "Still open" },
  { key: "done", label: "Complete" },
];

export function StatusReportPanel({ report }: { report: StatusReport }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return report.rows.filter((r) => {
      if (filter === "late" && r.daysLate === 0) return false;
      if (filter === "open" && r.finished) return false;
      if (filter === "done" && !r.finished) return false;
      if (!q) return true;
      return [r.employeeName, r.department, r.managerName, r.currentStageLabel]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [report.rows, filter, query]);

  const exportHref = `/performance/status/export${
    report.selectedCycleId ? `?cycle=${report.selectedCycleId}` : ""
  }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Cycle
          <select
            value={report.selectedCycleId ?? ""}
            onChange={(e) => router.push(`/performance/status?cycle=${e.target.value}`)}
            className={cn(field, "mt-1 block")}
          >
            {report.cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.status !== "active" ? ` (${c.status})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="relative text-xs text-muted-foreground">
          Search
          <Search className="pointer-events-none absolute bottom-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, department, manager"
            className={cn(field, "mt-1 block w-56 pl-8")}
          />
        </label>
        <a
          href={exportHref}
          download
          className="ml-auto inline-flex items-center rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <Download className="mr-1.5 h-4 w-4" /> Export to Excel
        </a>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Participants" value={report.summary.participants} />
        <Stat label="Complete" value={report.summary.finished} />
        <Stat label="In progress" value={report.summary.inProgress} />
        <Stat label="Not started" value={report.summary.notStarted} />
        <Stat label="Running late" value={report.summary.overdue} tone={report.summary.overdue > 0 ? "bad" : undefined} />
      </div>

      {report.outsideRoster > 0 && report.selectedCycleId && (
        <StrayBanner count={report.outsideRoster} cycleId={report.selectedCycleId} />
      )}

      {report.noWorkflow && (
        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          This cycle runs no workflow template, so progress is shown against the built-in stage
          ladder and only the goal-setting date applies. Give the cycle a template in performance
          settings to get a deadline on every stage.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent",
              filter === f.key && "border-primary bg-primary/10 text-primary",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Nobody matches that filter.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <ParticipantRow
              key={r.appraisalId}
              row={r}
              reviewers={report.reviewers[r.appraisalId]}
              colleagues={report.colleagues}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {rows.length} of {report.rows.length} shown · generated {report.generatedAt}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "bad";
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** One participant: the headline, then the stage track. */
function ParticipantRow({
  row,
  reviewers,
  colleagues,
}: {
  row: ParticipantProgress;
  reviewers?: ReviewerAssignment;
  colleagues: Colleague[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3">
        {/* The name opens that person's appraisal so HR can take the step that
            is holding them up; the rest of the row still expands the detail. */}
        <Link
          href={`/performance/appraisals/${row.appraisalId}/act`}
          title={`Open ${row.employeeName}'s appraisal and act for them`}
          className="font-medium hover:underline"
        >
          {row.employeeName}
        </Link>
        {row.department && (
          <span className="text-xs text-muted-foreground">{row.department}</span>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} stage detail for ${row.employeeName}`}
          className="ml-auto flex flex-wrap items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-accent/50"
        >
          {row.finished ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
              Complete
            </span>
          ) : (
            <>
              <span className="text-muted-foreground">
                {row.currentStageLabel} · waiting on {row.currentStageOwner}
              </span>
              {row.daysLate > 0 ? (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
                  {row.daysLate}d late
                </span>
              ) : (
                <span className="text-muted-foreground">due {row.currentStageDue}</span>
              )}
            </>
          )}
          <span className="tabular-nums text-muted-foreground">
            {row.completedCount}/{row.totalCount}
          </span>
        </button>
      </div>

      <div className="px-3 pb-3">
        <div className="flex gap-0.5" aria-hidden="true">
          {row.stages.map((s) => (
            <span
              key={s.key}
              title={`${s.label} — ${STAGE_STATE_LABEL[s.state]}, due ${s.dueDate}`}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                s.state === "done"
                  ? "bg-emerald-500"
                  : s.overdue
                    ? "bg-destructive"
                    : s.state === "current"
                      ? "bg-primary"
                      : "bg-muted",
              )}
            />
          ))}
        </div>
      </div>

      {open && (
        <div className="border-t px-3 py-2">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-medium">Stage</th>
                <th className="py-1 pr-2 font-medium">Owner</th>
                <th className="py-1 pr-2 font-medium">Due</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {row.stages.map((s) => (
                <tr key={s.key}>
                  <td className="py-1 pr-2">{s.label}</td>
                  <td className="py-1 pr-2 text-muted-foreground">{s.responsibleRole.replace(/_/g, " ")}</td>
                  <td className="py-1 pr-2 tabular-nums text-muted-foreground">{s.dueDate}</td>
                  <td
                    className={cn(
                      "py-1",
                      s.overdue ? "font-medium text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {s.overdue ? `In progress — ${s.daysLate}d late` : STAGE_STATE_LABEL[s.state]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!row.finished && (
            <Link
              href={`/performance/appraisals/${row.appraisalId}/act`}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent"
            >
              <UserCog className="h-3.5 w-3.5" /> Act for {row.employeeName}
            </Link>
          )}
          {reviewers && <ReviewerEditor assignment={reviewers} colleagues={colleagues} />}
        </div>
      )}
    </div>
  );
}

/**
 * Reassign who reviews this person.
 *
 * Reviewers came from the reporting line when the cycle launched and could not
 * be changed afterwards, so a transfer or a departed manager left the appraisal
 * with nobody able to act on it.
 */
function ReviewerEditor({
  assignment,
  colleagues,
}: {
  assignment: ReviewerAssignment;
  colleagues: Colleague[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [managerId, setManagerId] = useState(assignment.managerId ?? "");
  const [secondLevelId, setSecondLevelId] = useState(assignment.secondLevelId ?? "");

  // Nobody reviews their own appraisal, so keep the employee out of both lists.
  const options = useMemo(
    () => colleagues.filter((c) => c.id !== assignment.employeeId),
    [colleagues, assignment.employeeId],
  );

  const changed =
    managerId !== (assignment.managerId ?? "") || secondLevelId !== (assignment.secondLevelId ?? "");

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setAppraisalReviewers({
        appraisalId: assignment.appraisalId,
        managerId,
        secondLevelId: secondLevelId || null,
      });
      if (res.ok) setSaved(true);
      else setError(res.error ?? "Couldn't reassign the reviewers.");
    });
  }

  return (
    <div className="mt-3 rounded-md border border-dashed bg-muted/30 p-2">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <UserCog className="h-3.5 w-3.5" /> Reviewers
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Line manager
          <div className="mt-1 w-56">
            <SearchSelect
              value={managerId}
              onChange={(v) => setManagerId(v ?? "")}
              options={options}
              getOptionValue={(c) => c.id}
              getOptionLabel={(c) => c.name}
              placeholder="Choose a line manager"
            />
          </div>
        </label>
        <label className="text-xs text-muted-foreground">
          Second-level
          <div className="mt-1 w-56">
            <SearchSelect
              value={secondLevelId}
              onChange={(v) => setSecondLevelId(v ?? "")}
              options={options}
              getOptionValue={(c) => c.id}
              getOptionLabel={(c) => c.name}
              placeholder="None"
            />
          </div>
        </label>
        <Button size="sm" variant="outline" disabled={pending || !changed || !managerId} onClick={save}>
          Save reviewers
        </Button>
        {saved && !changed && <span className="text-xs text-emerald-700">Saved.</span>}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}


/**
 * The appraisals of people who left the roster, and the way to clear them.
 *
 * The banner used to end "clear them when convenient" and offer nothing to do
 * it with, so it stood for weeks. The button removes only the empty ones and
 * says what it kept and why; there is a second click before anything goes.
 */
function StrayBanner({ count, cycleId }: { count: number; cycleId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useStatusTransition("Clearing…");
  const [armed, setArmed] = useState(false);
  const [result, setResult] = useState<{ removed: number; kept: KeptAppraisal[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clear() {
    setError(null);
    startTransition(async () => {
      const res = await clearStrayAppraisals(cycleId);
      setArmed(false);
      if (!res.ok) {
        setError(res.error ?? "Couldn't clear them.");
        return;
      }
      setResult({ removed: res.removed, kept: res.kept });
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1">
          {count} appraisal{count === 1 ? " belongs" : "s belong"} to {count === 1 ? "somebody" : "people"} who {count === 1 ? "is" : "are"} no
          longer in the performance workflow — they cannot open the module, so they are left out of
          every figure here and are never chased. Usually somebody made a contractor, deactivated, or
          without a Performance role since the cycle launched.
        </p>
      </div>

      {/* Each button says what it does beside it, so the choice is read before
          it is made rather than discovered afterwards. The destructive one is
          two clicks away: the first click only opens the choice. */}
      {!armed ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 pl-6">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            title="Opens a confirmation. Nothing is removed until you confirm."
            onClick={() => setArmed(true)}
          >
            Clear the empty ones
          </Button>
          <span className="text-xs">
            Removes only appraisals with nothing in them. You will be asked to confirm first.
          </span>
        </div>
      ) : (
        <div className="mt-2 space-y-2 pl-6">
          <p className="text-xs">
            Only an appraisal with nothing in it goes — no goal, no step taken, no comment, no plan,
            no rating. Anything with content stays and is listed here with what it holds.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              title="Deletes the empty appraisals now. This cannot be undone."
              onClick={clear}
            >
              {pending ? "Clearing…" : "Remove"}
            </Button>
            <span className="text-xs">
              <span className="font-medium">Remove</span> deletes the empty appraisals now and
              records each one in the audit log under your name. Cannot be undone.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              title="Closes this without changing anything."
              onClick={() => setArmed(false)}
            >
              Keep them
            </Button>
            <span className="text-xs">
              <span className="font-medium">Keep them</span> changes nothing. The appraisals stay
              as they are and this notice remains.
            </span>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-1.5 pl-6 text-xs">
          <p>
            {result.removed === 0
              ? "Nothing was removed."
              : `Removed ${result.removed} empty appraisal${result.removed === 1 ? "" : "s"}.`}
          </p>
          {result.kept.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {result.kept.map((k) => (
                <li key={k.appraisalId}>
                  <span className="font-medium">{k.employeeName}</span> kept — holds {k.holds}.
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="mt-1.5 pl-6 text-xs text-destructive">{error}</p>}
    </div>
  );
}
