import { cn } from "@/lib/utils";
import type { CalibrationData } from "@/lib/appraisals";
import type { CalibrationAdjustment, CalibrationRosterRow } from "@/types/appraisal";
import { CalibrationCommittee } from "./calibration-committee";

/**
 * A balanced reference distribution (peak in the middle) the actual spread is
 * compared against — a soft guideline to surface grade inflation/deflation, not
 * a hard quota. Returns a target % per band, in the same order as the buckets.
 */
function guidelineTargets(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [100];
  const mid = (n - 1) / 2;
  const weights = Array.from({ length: n }, (_, i) => mid + 1 - Math.abs(i - mid));
  const sum = weights.reduce((s, w) => s + w, 0);
  return weights.map((w) => Math.round((w / sum) * 100));
}

export function CalibrationPanel({
  data,
  roster = [],
  adjustments = [],
}: {
  data: CalibrationData;
  roster?: CalibrationRosterRow[];
  adjustments?: CalibrationAdjustment[];
}) {
  if (data.total === 0 && roster.length === 0) return null;
  const targets = guidelineTargets(data.buckets.length);
  // Flag the top band (index 0 = highest) when it's materially over its guideline.
  const topPct = data.total > 0 ? Math.round((data.buckets[0]?.count / data.total) * 100) : 0;
  const topOver = topPct - (targets[0] ?? 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Calibration &amp; ratings</h2>
        <span className="text-sm text-muted-foreground">
          {data.total} rated · average {data.averageOverall ?? "—"}
        </span>
      </div>

      {data.total > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Overall rating distribution</h3>
            <span className="text-[11px] text-muted-foreground">
              bar = actual · marker = guideline
            </span>
          </div>
          <div className="space-y-2">
            {data.buckets.map((b, i) => {
              const pct = Math.round((b.count / data.total) * 100);
              const target = targets[i] ?? 0;
              const delta = pct - target;
              return (
                <div key={b.label} className="flex items-center gap-3 text-sm">
                  <span className="w-44 shrink-0 text-muted-foreground">{b.label}</span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    <div
                      className="absolute top-0 h-full border-l-2 border-amber-500/80"
                      style={{ left: `${Math.min(target, 100)}%` }}
                      title={`Guideline ${target}%`}
                    />
                  </div>
                  <span className="w-12 text-right tabular-nums font-medium">
                    {b.count} · {pct}%
                  </span>
                  <span
                    className={cn(
                      "w-12 text-right text-xs tabular-nums",
                      Math.abs(delta) <= 5
                        ? "text-muted-foreground"
                        : delta > 0
                          ? "text-amber-600"
                          : "text-blue-600",
                    )}
                    title="Deviation from guideline (percentage points)"
                  >
                    {delta > 0 ? `+${delta}` : delta}pp
                  </span>
                </div>
              );
            })}
          </div>
          {topOver > 5 && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              The top band is {topOver}pp over the guideline — review for grade inflation before
              finalising.
            </p>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Guideline is a balanced reference (peak in the middle), not a hard quota.
          </p>
        </div>
      )}

      <CalibrationCommittee roster={roster} adjustments={adjustments} />

      {data.byDept.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Department</th>
                <th className="px-4 py-2 font-medium">Rated</th>
                <th className="px-4 py-2 font-medium">Average</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.byDept.map((d) => (
                <tr key={d.department}>
                  <td className="px-4 py-2 font-medium">{d.department}</td>
                  <td className="px-4 py-2 text-muted-foreground">{d.count}</td>
                  <td className="px-4 py-2">{d.avg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
