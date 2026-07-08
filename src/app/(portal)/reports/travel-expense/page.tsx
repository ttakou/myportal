import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import {
  getDepartments,
  getReportPeople,
  getTravelExpenseReport,
  type TravelExpenseRow,
} from "@/lib/reports";
import { cn } from "@/lib/utils";
import { ProgressiveTableBody } from "@/components/ui/progressive-list";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";
import { ReportStampFooter } from "../_components/report-stamp-footer";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  manager_approved: "Manager approved",
  finance_approved: "Finance approved",
  rejected: "Rejected",
  completed: "Completed",
};

export default async function TravelExpenseReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; department?: string; user?: string }>;
}) {
  const access = await getAccess();
  if (!(access.isSystemAdmin || access.isAdmin || access.isFinance)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">
          This report is available to finance and system administrators.
        </p>
        <Link href="/reports" className="text-sm font-medium text-primary hover:underline">
          ← Back to reports
        </Link>
      </div>
    );
  }

  const sp = await searchParams;
  const from = sp.from || iso(new Date(new Date().getFullYear(), 0, 1)); // year-to-date
  const to = sp.to || iso(new Date());
  const department = sp.department || null;
  const userId = sp.user || null;

  const [departments, people, report] = await Promise.all([
    getDepartments(),
    getReportPeople(),
    getTravelExpenseReport({ from, to, department, userId }),
  ]);

  const fmtRow = (r: TravelExpenseRow) => [
    r.depart_date,
    r.traveller ?? "",
    r.department ?? "",
    r.destination,
    r.purpose ?? "",
    STATUS_LABEL[r.status] ?? r.status,
    String(r.estimated),
    String(r.actual),
  ];
  const csv: string[][] = [
    ["Depart", "Traveller", "Department", "Destination", "Purpose", "Status", "Estimated", "Actual"],
    ...report.rows.map(fmtRow),
  ];

  const meta = [
    `Period: ${from} → ${to}`,
    department ? `Department: ${department}` : "All departments",
    userId ? `Person: ${people.find((p) => p.id === userId)?.name ?? "—"}` : "All travellers",
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
          <CsvExportButton filename={`travel-expense-${from}_${to}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="Out-of-town travel & expense"
        subtitle="Estimated vs actual spend per trip (by departure date), with a per-department roll-up."
        meta={meta}
      />

      <div className="print:hidden">
        <ReportFilters
          show={{ period: true, department: true, user: true }}
          departments={departments}
          users={people}
          from={from}
          to={to}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Trips" value={String(report.summary.trips)} />
        <Kpi label="Estimated" value={money(report.summary.estimated)} />
        <Kpi label="Actual" value={money(report.summary.actual)} />
        <Kpi
          label="Variance"
          value={money(report.summary.variance)}
          tone={report.summary.variance > 0 ? "red" : "green"}
        />
      </div>

      {report.byDept.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            By department
          </div>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Department</th>
                <th className="py-1.5 font-medium">Trips</th>
                <th className="py-1.5 text-right font-medium">Estimated</th>
                <th className="py-1.5 text-right font-medium">Actual</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.byDept.map((d) => (
                <tr key={d.department}>
                  <td className="py-1.5">{d.department}</td>
                  <td className="py-1.5 tabular-nums">{d.trips}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(d.estimated)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(d.actual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Depart</th>
              <th className="px-3 py-2 font-medium">Traveller</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 font-medium">Destination</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Estimated</th>
              <th className="px-3 py-2 text-right font-medium">Actual</th>
            </tr>
          </thead>
          <ProgressiveTableBody colSpan={7} className="divide-y" label="Show more trips">
            {report.rows.map((r) => (
              <tr key={r.trip_id}>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.depart_date}</td>
                <td className="px-3 py-1.5 font-medium">{r.traveller ?? "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.department ?? "—"}</td>
                <td className="px-3 py-1.5">{r.destination}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{STATUS_LABEL[r.status] ?? r.status}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(r.estimated)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(r.actual)}</td>
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No trips match these filters.
                </td>
              </tr>
            )}
          </ProgressiveTableBody>
        </table>
      </div>
      <ReportStampFooter />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "red" | "green" }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        tone === "red" && "border-amber-300 bg-amber-50",
        tone === "green" && "border-green-300 bg-green-50",
      )}
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
