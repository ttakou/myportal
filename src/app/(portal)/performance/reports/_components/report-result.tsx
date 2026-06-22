"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MEASURE_LABEL, type Measure } from "@/types/reporting";
import type { ReportResult } from "@/lib/report-run";

export function ReportResultView({ name, result }: { name: string; result: ReportResult }) {
  const cols = result.measures;

  function downloadCsv() {
    const header = [result.dimensionLabel, "Headcount", ...cols.map((m) => MEASURE_LABEL[m])];
    const lines = result.rows.map((r) => [r.group, String(r.headcount), ...cols.map((m) => r.values[m] ?? "")]);
    const csv = [header, ...lines]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "_").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={downloadCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / PDF
        </Button>
      </div>

      {result.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No data for this report.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">{result.dimensionLabel}</th>
                <th className="px-4 py-2 font-medium">Headcount</th>
                {cols.map((m) => (
                  <th key={m} className="px-4 py-2 font-medium">{MEASURE_LABEL[m]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.group} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{r.group}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.headcount}</td>
                  {cols.map((m: Measure) => (
                    <td key={m} className="px-4 py-2">{r.values[m] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
