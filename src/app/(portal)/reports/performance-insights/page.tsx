import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getCycles } from "@/lib/appraisals";
import { getPerformanceInsights } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";
import { ReportStampFooter } from "../_components/report-stamp-footer";

export default async function PerformanceInsightsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">This report is available to HR and system administrators.</p>
        <Link href="/reports" className="text-sm font-medium text-primary hover:underline">
          ← Back to reports
        </Link>
      </div>
    );
  }

  const sp = await searchParams;
  const cycles = await getCycles();
  const cycle = (sp.cycle ? cycles.find((c) => c.id === sp.cycle) : null) ?? cycles[0] ?? null;
  const insights = cycle ? await getPerformanceInsights(cycle.id) : null;

  const csv: string[][] = [
    ["Section", "Name", "Rated", "Average"],
    ...(insights?.byManager ?? []).map((m) => [
      "Manager effectiveness",
      m.manager,
      String(m.rated),
      m.avgScore != null ? `${m.avgScore}%` : "",
    ]),
    ...(insights?.competencyGaps ?? []).map((c) => [
      "Competency",
      c.competency,
      String(c.rated),
      c.avgRating != null ? `${c.avgRating}/5` : "",
    ]),
  ];

  const meta = [cycle ? `Cycle: ${cycle.name}` : "No cycle"];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Reports
        </Link>
        <div className="flex items-center gap-2">
          <CsvExportButton filename={`appraisal-insights-${cycle?.name ?? "cycle"}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="Performance insights"
        subtitle="Rating consistency by manager, competency strengths and gaps, and appeals for the cycle."
        meta={meta}
      />

      <div className="print:hidden">
        <ReportFilters show={{ cycle: true }} cycles={cycles} />
      </div>

      {!cycle || !insights ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No appraisal cycle to report on yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Scored appraisals" value={String(insights.scored)} />
            <Kpi label="Managers rated" value={String(insights.byManager.length)} />
            <Kpi
              label="Appeals open"
              value={String(insights.appeals.open)}
              tone={insights.appeals.open > 0 ? "amber" : "green"}
            />
            <Kpi label="Appeals resolved" value={String(insights.appeals.resolved)} />
          </div>

          {/* Manager effectiveness */}
          <Section title="Manager effectiveness" subtitle="Average final score of each manager's scored reports.">
            {insights.byManager.length === 0 ? (
              <Empty>No scored appraisals yet.</Empty>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Manager</th>
                    <th className="px-3 py-2 font-medium">Reports scored</th>
                    <th className="px-3 py-2 text-right font-medium">Average score</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {insights.byManager.map((m) => (
                    <tr key={m.manager}>
                      <td className="px-3 py-1.5 font-medium">{m.manager}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{m.rated}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {m.avgScore != null ? `${m.avgScore}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Competency gaps */}
          <Section
            title="Competency strengths & gaps"
            subtitle="Average manager rating per competency across the cycle — weakest first."
          >
            {insights.competencyGaps.length === 0 ? (
              <Empty>No competency ratings yet.</Empty>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Competency</th>
                    <th className="px-3 py-2 font-medium">Ratings</th>
                    <th className="px-3 py-2 text-right font-medium">Average (/5)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {insights.competencyGaps.map((c) => (
                    <tr key={c.competency}>
                      <td className="px-3 py-1.5 font-medium">{c.competency}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{c.rated}</td>
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right tabular-nums",
                          c.avgRating != null && c.avgRating < 3 && "text-amber-700",
                        )}
                      >
                        {c.avgRating != null ? c.avgRating.toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}
      <ReportStampFooter />
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "amber" | "green" }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        tone === "amber" && value !== "0" && "border-amber-300 bg-amber-50",
        tone === "green" && "border-green-300 bg-green-50",
      )}
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
