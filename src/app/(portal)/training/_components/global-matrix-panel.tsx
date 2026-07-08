import Link from "next/link";
import { Check, CircleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GlobalMatrix } from "@/lib/training";
import { CsvExportButton } from "../../reports/_components/csv-export-button";
import { PrintButton } from "../../reports/_components/print-button";
import { ReportHeader } from "../../reports/_components/report-header";
import { ReportStampFooter } from "../../reports/_components/report-stamp-footer";

/**
 * Global training matrix — every active employee × every course that matters
 * (statutory, or with at least one completion record). Cells show the latest
 * record's state; status is never colour-alone (icon + tooltip carry it too).
 */
export function GlobalMatrixPanel({ data, dept }: { data: GlobalMatrix; dept: string | null }) {
  const rows = dept ? data.rows.filter((r) => r.department === dept) : data.rows;

  const csv: string[][] = [
    ["Employee", "Department", ...data.courses.map((c) => (c.code ? `${c.code} ${c.title}` : c.title))],
    ...rows.map((r) => [
      r.name,
      r.department ?? "",
      ...data.courses.map((c) => {
        const cell = r.cells[c.id];
        if (!cell) return "";
        return cell.status === "valid"
          ? `valid${cell.expires_on ? ` until ${cell.expires_on}` : ""}`
          : cell.status === "expiring"
            ? `expiring ${cell.expires_on}`
            : `EXPIRED ${cell.expires_on}`;
      }),
    ]),
  ];

  const counts = { valid: 0, expiring: 0, expired: 0, missing: 0 };
  for (const r of rows) {
    for (const c of data.courses) {
      const cell = r.cells[c.id];
      if (!cell) counts.missing += 1;
      else counts[cell.status] += 1;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <label className="text-xs text-muted-foreground">
          Department
          <div className="mt-1 flex flex-wrap gap-1">
            <Link
              href="/training?view=matrix-global"
              className={cn("rounded-md border px-2.5 py-1 text-sm", !dept ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}
            >
              All ({data.rows.length})
            </Link>
            {data.departments.map((d) => (
              <Link
                key={d}
                href={`/training?view=matrix-global&dept=${encodeURIComponent(d)}`}
                className={cn("rounded-md border px-2.5 py-1 text-sm", dept === d ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}
              >
                {d}
              </Link>
            ))}
          </div>
        </label>
        <div className="flex gap-2">
          <CsvExportButton filename={`training-matrix${dept ? `_${dept}` : ""}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <div className="hidden print:block">
        <ReportHeader title="Global Training Matrix" subtitle={dept ? `Department: ${dept}` : "All departments"} />
      </div>

      {/* Legend — status is icon + word, never colour alone. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-green-600" /> Valid ({counts.valid})</span>
        <span className="inline-flex items-center gap-1"><CircleAlert className="h-3.5 w-3.5 text-amber-600" /> Expiring ≤90d ({counts.expiring})</span>
        <span className="inline-flex items-center gap-1"><X className="h-3.5 w-3.5 text-red-600" /> Expired ({counts.expired})</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/30" /> Never trained ({counts.missing})</span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted px-3 py-2 font-medium">Employee</th>
              {data.courses.map((c) => (
                <th key={c.id} className="px-2 py-2 text-center font-medium" title={c.title}>
                  <span className="inline-block max-w-24 truncate align-bottom">
                    {c.code ?? c.title}
                  </span>
                  {c.statutory && <span className="block text-[10px] font-normal text-amber-700">statutory</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.profile_id}>
                <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                  <span className="font-medium">{r.name}</span>
                  {r.department && <span className="block text-[11px] text-muted-foreground">{r.department}</span>}
                </td>
                {data.courses.map((c) => {
                  const cell = r.cells[c.id];
                  if (!cell) {
                    return (
                      <td key={c.id} className="px-2 py-1.5 text-center" title={`${r.name} — ${c.title}: never trained`}>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/25" />
                      </td>
                    );
                  }
                  const tip = `${r.name} — ${c.title}: ${cell.status}${cell.expires_on ? ` (expires ${cell.expires_on})` : ""}`;
                  return (
                    <td key={c.id} className="px-2 py-1.5 text-center" title={tip}>
                      {cell.status === "valid" && <Check className="inline h-4 w-4 text-green-600" />}
                      {cell.status === "expiring" && <CircleAlert className="inline h-4 w-4 text-amber-600" />}
                      {cell.status === "expired" && <X className="inline h-4 w-4 text-red-600" />}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={data.courses.length + 1} className="px-3 py-8 text-center text-muted-foreground">
                  No active employees{dept ? ` in ${dept}` : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="hidden print:block">
        <ReportStampFooter label="Training Matrix" />
      </div>
    </div>
  );
}
