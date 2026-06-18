import type { AppraisalHistoryEntry } from "@/lib/appraisals";

/**
 * A compact bar chart of the employee's overall rating per cycle, oldest→newest.
 * Renders only when there are at least two rated cycles to compare.
 */
export function AppraisalHistory({ history }: { history: AppraisalHistoryEntry[] }) {
  const rated = history.filter((h) => h.overall_rating != null);
  if (rated.length < 2) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">My rating history</h2>
      <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
        {rated.map((h) => (
          <div
            key={h.cycle_id}
            className="flex w-14 flex-col items-center gap-1"
            title={h.rating_label ?? undefined}
          >
            <div className="flex h-24 w-6 items-end overflow-hidden rounded bg-muted">
              <div
                className="w-full rounded-t bg-primary"
                style={{ height: `${((h.overall_rating ?? 0) / 5) * 100}%` }}
              />
            </div>
            <span className="text-sm font-semibold tabular-nums">{h.overall_rating}</span>
            <span className="text-xs text-muted-foreground">{h.year}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Overall rating (out of 5) per appraisal cycle.</p>
    </section>
  );
}
