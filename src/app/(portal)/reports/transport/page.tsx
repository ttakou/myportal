import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getDepartments, getTransportReport } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
const cap = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default async function TransportReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; department?: string }>;
}) {
  const access = await getAccess();
  if (!(access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">This report is available to administrators.</p>
        <Link href="/reports" className="text-sm font-medium text-primary hover:underline">
          ← Back to reports
        </Link>
      </div>
    );
  }

  const sp = await searchParams;
  const from = sp.from || iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); // month-to-date
  const to = sp.to || iso(new Date());
  const department = sp.department || null;

  const [departments, report] = await Promise.all([
    getDepartments(),
    getTransportReport({ from, to, department }),
  ]);

  const csv: string[][] = [
    ["Department", "Requests"],
    ...report.byDept.map((d) => [d.department, String(d.count)]),
  ];

  const meta = [
    `Period: ${from} → ${to}`,
    department ? `Department: ${department}` : "All departments",
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
          <CsvExportButton filename={`transport-${from}_${to}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="Transportation requests & SLA"
        subtitle="Requests by departure time: completion vs cancellation, active backlog and overdue, with breakdowns."
        meta={meta}
      />

      <div className="print:hidden">
        <ReportFilters show={{ period: true, department: true }} departments={departments} from={from} to={to} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Requests" value={String(report.summary.total)} />
        <Kpi label="Completed" value={String(report.summary.completed)} tone="green" />
        <Kpi label="Completion" value={`${report.summary.completionRate}%`} tone={report.summary.completionRate >= 90 ? "green" : undefined} />
        <Kpi label="Active" value={String(report.summary.active)} />
        <Kpi label="Overdue" value={String(report.summary.overdue)} tone={report.summary.overdue > 0 ? "red" : undefined} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Breakdown title="By status" rows={report.byStatus.map((s) => [cap(s.status), s.count])} />
        <Breakdown title="By task type" rows={report.byTaskType.map((t) => [cap(t.taskType), t.count])} />
        <Breakdown title="By department" rows={report.byDept.map((d) => [d.department, d.count])} />
      </div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {rows.map(([label, n]) => (
            <tr key={label}>
              <td className="py-1.5">{label}</td>
              <td className="py-1.5 text-right tabular-nums">{n}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td className="py-4 text-center text-muted-foreground">No data.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "red" | "green" }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        tone === "red" && "border-destructive/40 bg-destructive/5",
        tone === "green" && "border-green-300 bg-green-50",
      )}
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
