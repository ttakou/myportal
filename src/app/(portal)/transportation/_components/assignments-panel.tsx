"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Minus, PencilLine, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useStatusTransition } from "@/components/activity";
import { CsvExportButton } from "@/app/(portal)/reports/_components/csv-export-button";
import { PrintButton } from "@/app/(portal)/reports/_components/print-button";
import {
  DAY_SOURCE_LABEL,
  MAX_DAILY_ASSIGNMENTS,
  dayLabel,
  gridTable,
  shiftMonth,
  type AssignmentGrid,
  type DaySource,
} from "@/lib/transport/daily-assignments";
import { recordDailyAssignments } from "../actions";

const SOURCE_DOT: Record<DaySource, string> = {
  import: "bg-slate-400",
  tally: "bg-blue-500",
  portal: "bg-emerald-500",
  none: "bg-amber-500",
  upcoming: "bg-transparent",
};

const href = (month: string) => `/transportation?view=assignments&month=${month}`;

/**
 * The daily assignments monitoring sheet, one month at a time: weeks and
 * days down the side, drivers across, the day's total on the right and the
 * driver totals at the bottom, as on the desk's workbook. The desk records
 * a day by clicking it; finance reads.
 */
export function AssignmentsPanel({
  grid,
  today,
  canRecord,
  footer,
}: {
  grid: AssignmentGrid;
  /** Today on the site clock, YYYY-MM-DD. */
  today: string;
  canRecord: boolean;
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const thisMonth = today.slice(0, 7);
  const busiest = grid.drivers.reduce<(typeof grid.drivers)[number] | null>((best, d) => (d.total > (best?.total ?? 0) ? d : best), null);
  const perDay = grid.workedDays > 0 ? Math.round((grid.total / grid.workedDays) * 10) / 10 : 0;
  const peak = Math.max(1, ...grid.days.flatMap((d) => Object.values(d.counts)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarDays className="h-5 w-5 text-primary" /> Daily assignments · {grid.label}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            The monitoring sheet: how many assignments each driver ran each day. A day the desk records shows its tally; any
            other past day counts the tasks dispatched to drivers in the portal.
            {canRecord && " Click a day to record or correct it."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {canRecord && grid.month === thisMonth && (
            <Button size="sm" onClick={() => setEditing(today)}>
              <PencilLine className="mr-1.5 h-4 w-4" /> Record today
            </Button>
          )}
          <CsvExportButton filename={`daily-assignments-${grid.month}.csv`} table={gridTable(grid)} />
          <PrintButton />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button size="sm" variant="outline" onClick={() => router.push(href(shiftMonth(grid.month, -1)))} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <input
          type="month"
          value={grid.month}
          onChange={(e) => e.target.value && router.push(href(e.target.value))}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
          aria-label="Month"
        />
        <Button size="sm" variant="outline" onClick={() => router.push(href(shiftMonth(grid.month, 1)))} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
        {grid.month !== thisMonth && (
          <Button size="sm" variant="ghost" onClick={() => router.push(href(thisMonth))}>
            This month
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Assignments" value={grid.total.toLocaleString("en-GB")} />
        <Tile label="Days worked" value={String(grid.workedDays)} />
        <Tile label="Per working day" value={perDay.toLocaleString("en-GB")} />
        <Tile label="Busiest driver" value={busiest ? String(busiest.total) : "—"} sub={busiest?.name} />
        <Tile label="Days not recorded" value={String(grid.missingDays)} tone={grid.missingDays > 0 ? "amber" : undefined} sub={grid.missingDays > 0 ? "Past days with no tally and no portal task" : undefined} />
      </div>

      {editing && canRecord && <DayEditor grid={grid} date={editing} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="sticky left-0 z-10 border-b bg-muted px-2 py-2 text-left font-semibold">Week</th>
              <th className="sticky left-14 z-10 border-b border-r bg-muted px-2 py-2 text-left font-semibold">Day</th>
              {grid.drivers.map((d) => (
                <th key={d.id} className={cn("h-36 border-b px-1 align-bottom font-medium", !d.active && "text-muted-foreground")} title={d.active ? d.name : `${d.name} (no longer driving)`}>
                  <span className="inline-block rotate-180 whitespace-nowrap py-1 [writing-mode:vertical-rl]">{d.name}</span>
                </th>
              ))}
              <th className="border-b border-l px-2 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {grid.days.map((d) => {
              const clickable = canRecord && d.source !== "upcoming";
              return (
                <tr
                  key={d.date}
                  className={cn(
                    "border-b last:border-b-0",
                    d.firstOfWeek && "border-t-2 border-t-muted-foreground/20",
                    d.source === "upcoming" && "text-muted-foreground/60",
                    editing === d.date && "bg-primary/5",
                    clickable && "cursor-pointer hover:bg-accent/40",
                  )}
                  onClick={clickable ? () => setEditing(d.date) : undefined}
                >
                  {d.firstOfWeek && (
                    <td rowSpan={d.weekSpan} className="sticky left-0 z-10 w-14 bg-background px-2 py-1 align-top font-medium text-muted-foreground">
                      Week {d.week}
                    </td>
                  )}
                  <td className="sticky left-14 z-10 whitespace-nowrap border-r bg-background px-2 py-1">
                    <span className="inline-flex items-center gap-1.5" title={DAY_SOURCE_LABEL[d.source] || undefined}>
                      <span className={cn("h-2 w-2 rounded-full", SOURCE_DOT[d.source])} aria-hidden />
                      {dayLabel(d)}
                    </span>
                  </td>
                  {grid.drivers.map((dr) => {
                    const n = d.counts[dr.id] ?? 0;
                    return (
                      <td
                        key={dr.id}
                        className={cn(
                          "px-1 py-1 text-center tabular-nums",
                          n > 0 && n / peak >= 0.6 && "bg-primary/20 font-semibold",
                          n > 0 && n / peak >= 0.3 && n / peak < 0.6 && "bg-primary/10",
                        )}
                      >
                        {n > 0 ? n : ""}
                      </td>
                    );
                  })}
                  <td className="border-l px-2 py-1 text-right font-semibold tabular-nums">
                    {d.source === "upcoming" ? "" : d.source === "none" ? <span className="font-normal text-amber-700">—</span> : d.total}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/50 font-semibold">
            <tr className="border-t-2">
              <td colSpan={2} className="sticky left-0 z-10 border-r bg-muted px-2 py-2">
                Total
              </td>
              {grid.drivers.map((d) => (
                <td key={d.id} className="px-1 py-2 text-center tabular-nums">
                  {d.total}
                </td>
              ))}
              <td className="border-l px-2 py-2 text-right tabular-nums">{grid.total.toLocaleString("en-GB")}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {(["import", "tally", "portal", "none"] as DaySource[]).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", SOURCE_DOT[s])} aria-hidden />
            {s === "import" && "Sheet: loaded from the 2026 monitoring workbook"}
            {s === "tally" && "Recorded: the desk's tally in the portal"}
            {s === "portal" && "Portal tasks: counted from tasks dispatched to drivers"}
            {s === "none" && "Not recorded: a past day with no tally and no portal task"}
          </li>
        ))}
      </ul>
      {footer}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "amber" }) {
  return (
    <div className={cn("rounded-lg border bg-card p-3", tone === "amber" && "border-amber-300 bg-amber-50")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * Record one day: a counter per driver, started from what the sheet shows
 * for the day (the tally if there is one, else the portal tasks). Saving
 * writes every driver's count, zeros included, so the day reads as recorded.
 */
function DayEditor({ grid, date, onClose, onSaved }: { grid: AssignmentGrid; date: string; onClose: () => void; onSaved: () => void }) {
  const day = grid.days.find((d) => d.date === date);
  const counts = day?.counts ?? {};
  const rows = grid.drivers.filter((d) => d.active || (counts[d.id] ?? 0) > 0);
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((d) => [d.id, counts[d.id] ?? 0])));
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const total = Object.values(vals).reduce((s, n) => s + n, 0);
  const set = (id: string, n: number) => setVals((v) => ({ ...v, [id]: Math.max(0, Math.min(MAX_DAILY_ASSIGNMENTS, Number.isFinite(n) ? Math.floor(n) : 0)) }));
  const label = day ? dayLabel(day) : date;

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await recordDailyAssignments(
        date,
        rows.map((d) => ({ driverId: d.id, n: vals[d.id] ?? 0 })),
      );
      if (!res.ok) setError(res.error ?? "Could not save the day.");
      else {
        onClose();
        onSaved();
      }
    });
  };

  return (
    <section className="rounded-lg border border-primary/30 bg-card p-4 print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Record {label} · {total} assignment{total === 1 ? "" : "s"}
        </h3>
        <p className="text-xs text-muted-foreground">
          {day?.source === "import" || day?.source === "tally"
            ? `Currently ${DAY_SOURCE_LABEL[day.source].toLowerCase()}; saving replaces it.`
            : day?.source === "portal"
              ? "Started from the portal tasks; add the runs the portal did not see."
              : "Nothing recorded yet."}
        </p>
      </div>
      {error && <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
            <span className={cn("truncate", !d.active && "text-muted-foreground")} title={d.name}>
              {d.name}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button type="button" className="rounded border p-1 hover:bg-accent disabled:opacity-40" disabled={pending || (vals[d.id] ?? 0) === 0} onClick={() => set(d.id, (vals[d.id] ?? 0) - 1)} aria-label={`One less for ${d.name}`}>
                <Minus className="h-3 w-3" />
              </button>
              <input
                type="number"
                min={0}
                max={MAX_DAILY_ASSIGNMENTS}
                value={vals[d.id] ?? 0}
                onChange={(e) => set(d.id, Number(e.target.value))}
                className="w-12 rounded border bg-background px-1 py-0.5 text-center tabular-nums"
                aria-label={`Assignments for ${d.name}`}
              />
              <button type="button" className="rounded border p-1 hover:bg-accent disabled:opacity-40" disabled={pending} onClick={() => set(d.id, (vals[d.id] ?? 0) + 1)} aria-label={`One more for ${d.name}`}>
                <Plus className="h-3 w-3" />
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={save} disabled={pending}>
          Save {label}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
