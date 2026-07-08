import type { PeriodTrainingStats } from "@/lib/training";
import { ReportFilters } from "../../reports/_components/report-filters";
import { CsvExportButton } from "../../reports/_components/csv-export-button";
import { PrintButton } from "../../reports/_components/print-button";
import { ReportHeader } from "../../reports/_components/report-header";
import { ReportStampFooter } from "../../reports/_components/report-stamp-footer";

function n(x: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(x);
}

/**
 * Rapport des formations sur une période — all training activity between two
 * dates: sessions, people, person-hours, cost, completions; broken down by
 * course and by department. Printable via the branded letterhead.
 */
export function PeriodReportPanel({ data, currency }: { data: PeriodTrainingStats; currency: string }) {
  const tiles = [
    { label: "Sessions", value: n(data.sessions), hint: `${data.completedSessions} completed` },
    { label: "People trained", value: n(data.peopleTrained) },
    { label: "Person-hours", value: n(data.hours) },
    { label: "Cost", value: `${n(data.cost)} ${currency}` },
    { label: "Completions recorded", value: n(data.completions) },
  ];

  const csv: string[][] = [
    ["Course", "Sessions", "People", "Person-hours", `Cost (${currency})`],
    ...data.byCourse.map((c) => [c.title, String(c.sessions), String(c.people), String(c.hours), String(c.cost)]),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <ReportFilters show={{ period: true }} from={data.from} to={data.to} />
        <div className="flex gap-2">
          <CsvExportButton filename={`training-report_${data.from}_${data.to}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <div className="hidden print:block">
        <ReportHeader title="Training Report" subtitle="Activity over a period" meta={[`${data.from} → ${data.to}`]} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className="text-xl font-semibold tabular-nums">{t.value}</p>
            {t.hint && <p className="text-[11px] text-muted-foreground">{t.hint}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4 break-inside-avoid">
          <h2 className="mb-2 text-sm font-semibold">By course</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Course</th>
                <th className="py-1.5 text-right font-medium">Sessions</th>
                <th className="py-1.5 text-right font-medium">People</th>
                <th className="py-1.5 text-right font-medium">Hours</th>
                <th className="py-1.5 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.byCourse.map((c) => (
                <tr key={c.title}>
                  <td className="py-1.5">{c.title}</td>
                  <td className="py-1.5 text-right tabular-nums">{c.sessions}</td>
                  <td className="py-1.5 text-right tabular-nums">{c.people}</td>
                  <td className="py-1.5 text-right tabular-nums">{n(c.hours)}</td>
                  <td className="py-1.5 text-right tabular-nums">{n(c.cost)}</td>
                </tr>
              ))}
              {data.byCourse.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No sessions in this period.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border bg-card p-4 break-inside-avoid">
          <h2 className="mb-2 text-sm font-semibold">By department</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Department</th>
                <th className="py-1.5 text-right font-medium">People in sessions</th>
                <th className="py-1.5 text-right font-medium">Completions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.byDepartment.map((d) => (
                <tr key={d.department}>
                  <td className="py-1.5">{d.department}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.people}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.completions}</td>
                </tr>
              ))}
              {data.byDepartment.length === 0 && (
                <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No activity in this period.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <div className="hidden print:block">
        <ReportStampFooter label="Training Report" />
      </div>
    </div>
  );
}
