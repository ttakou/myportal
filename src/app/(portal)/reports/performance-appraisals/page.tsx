import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getCycles } from "@/lib/appraisals";
import {
  getDepartments,
  getPerformanceCompletionReport,
  getReportPeople,
  type PerfCompletionRow,
} from "@/lib/reports";
import { STAGE_LABEL, STATUS_LABEL, type AppraisalStage, type AppraisalStatus } from "@/types/appraisal";
import { cn } from "@/lib/utils";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";

const statusLabel = (s: string) => STATUS_LABEL[s as AppraisalStatus] ?? s;
const stageLabel = (s: string) => STAGE_LABEL[s as AppraisalStage] ?? s;

export default async function PerformanceCompletionReportPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string; department?: string; user?: string }>;
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
  const department = sp.department || null;
  const userId = sp.user || null;

  const [departments, people, report] = await Promise.all([
    getDepartments(),
    getReportPeople(),
    cycle
      ? getPerformanceCompletionReport({
          cycleId: cycle.id,
          periodEnd: cycle.period_end ?? null,
          department,
          userId,
        })
      : Promise.resolve(null),
  ]);

  const fmtRow = (r: PerfCompletionRow) => [
    r.employee ?? "",
    r.department ?? "",
    r.manager ?? "",
    stageLabel(r.stage),
    statusLabel(r.status),
    r.overdue ? "Overdue" : "",
  ];
  const csv: string[][] = [
    ["Employee", "Department", "Manager", "Stage", "Status", "Flag"],
    ...(report?.rows ?? []).map(fmtRow),
  ];

  const meta = [
    cycle ? `Cycle: ${cycle.name}` : "No cycle",
    department ? `Department: ${department}` : "All departments",
    userId ? `Employee: ${people.find((p) => p.id === userId)?.name ?? "—"}` : "All employees",
  ];

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
          <CsvExportButton filename={`appraisal-completion-${cycle?.name ?? "cycle"}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="Appraisal completion & SLA"
        subtitle="Per-employee appraisal stage and status for the cycle, with overdue cases flagged."
        meta={meta}
      />

      <div className="print:hidden">
        <ReportFilters
          show={{ cycle: true, department: true, user: true }}
          cycles={cycles}
          departments={departments}
          users={people}
        />
      </div>

      {!cycle || !report ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No appraisal cycle to report on yet.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Appraisals" value={String(report.summary.total)} />
            <Kpi label="Completed" value={String(report.summary.completed)} />
            <Kpi
              label="Completion"
              value={`${report.summary.completionPct}%`}
              tone={report.summary.completionPct >= 90 ? "green" : undefined}
            />
            <Kpi label="Overdue" value={String(report.summary.overdue)} tone={report.summary.overdue > 0 ? "red" : "green"} />
          </div>

          {report.byStatus.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                By status
              </div>
              <div className="flex flex-wrap gap-2">
                {report.byStatus.map((s) => (
                  <span key={s.status} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                    {statusLabel(s.status)}: <span className="font-semibold">{s.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Department</th>
                  <th className="px-3 py-2 font-medium">Manager</th>
                  <th className="px-3 py-2 font-medium">Stage</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.rows.map((r) => (
                  <tr key={r.appraisal_id} className={cn(r.overdue && "bg-destructive/5")}>
                    <td className="px-3 py-1.5 font-medium">
                      {r.employee ?? "—"}
                      {r.overdue && (
                        <span className="ml-2 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-destructive">
                          Overdue
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.department ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.manager ?? "—"}</td>
                    <td className="px-3 py-1.5">{stageLabel(r.stage)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{statusLabel(r.status)}</td>
                  </tr>
                ))}
                {report.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      No appraisals match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "red" | "green" }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        tone === "red" && value !== "0" && "border-destructive/40 bg-destructive/5",
        tone === "green" && "border-green-300 bg-green-50",
      )}
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
