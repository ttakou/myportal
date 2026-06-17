import type { CalibrationData } from "@/lib/appraisals";
import type { CalibrationAdjustment, CalibrationRosterRow } from "@/types/appraisal";
import { CalibrationCommittee } from "./calibration-committee";

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
  const max = Math.max(1, ...data.buckets.map((b) => b.count));

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
          <h3 className="mb-3 text-sm font-semibold">Overall rating distribution</h3>
          <div className="space-y-2">
            {data.buckets.map((b) => (
              <div key={b.label} className="flex items-center gap-3 text-sm">
                <span className="w-44 shrink-0 text-muted-foreground">{b.label}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(b.count / max) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right font-medium">{b.count}</span>
              </div>
            ))}
          </div>
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
