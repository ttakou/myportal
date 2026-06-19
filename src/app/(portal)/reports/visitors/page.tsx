import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getDepartments, getVisitorReport, type VisitorRow } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
const STATUS_LABEL: Record<string, string> = {
  pre_registered: "Pre-registered",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
};
function dur(mins: number | null): string {
  if (mins == null) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
/** HH:MM (UTC) for an ISO timestamp, or "—". */
function clock(ts: string | null): string {
  return ts ? new Date(ts).toISOString().slice(11, 16) : "—";
}
function vehicle(r: { vehicle_type: string | null; vehicle_plate: string | null }): string {
  return [r.vehicle_type, r.vehicle_plate].filter(Boolean).join(" · ") || "—";
}

export default async function VisitorReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; department?: string }>;
}) {
  const access = await getAccess();
  if (!(access.isSystemAdmin || access.isAdmin || access.isOim)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">This report is available to reception and administrators.</p>
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
    getVisitorReport({ from, to, department }),
  ]);

  const csv: string[][] = [
    ["Date", "Visitor", "Company", "Host", "Department", "Purpose", "Vehicle type", "Plate", "Status", "Arrival (UTC)", "Checkout (UTC)", "Dwell"],
    ...report.rows.map((r) => [
      r.visit_date,
      r.name,
      r.company ?? "",
      r.host ?? "",
      r.department ?? "",
      r.purpose ?? "",
      r.vehicle_type ?? "",
      r.vehicle_plate ?? "",
      STATUS_LABEL[r.status] ?? r.status,
      clock(r.check_in_at),
      clock(r.check_out_at),
      dur(r.dwellMins),
    ]),
  ];

  const meta = [
    `Period: ${from} → ${to}`,
    department ? `Host department: ${department}` : "All departments",
  ];

  return (
    <div className="space-y-5">
      {/* Print on A3 — the visitor table is wide (vehicle + arrival/checkout). */}
      <style>{"@media print { @page { size: A3; margin: 12mm; } }"}</style>
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Reports
        </Link>
        <div className="flex items-center gap-2">
          <CsvExportButton filename={`visitors-${from}_${to}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="Visitor throughput"
        subtitle="Visits over the period: check-in/out, no-shows, average dwell time, and company / host-department breakdowns."
        meta={meta}
      />

      <div className="print:hidden">
        <ReportFilters show={{ period: true, department: true }} departments={departments} from={from} to={to} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Visits" value={String(report.summary.total)} />
        <Kpi label="On site" value={String(report.summary.checkedIn)} />
        <Kpi label="Checked out" value={String(report.summary.checkedOut)} tone="green" />
        <Kpi label="No-shows" value={String(report.summary.noShow)} tone={report.summary.noShow > 0 ? "amber" : undefined} />
        <Kpi label="Cancelled" value={String(report.summary.cancelled)} />
        <Kpi label="Avg dwell" value={dur(report.summary.avgDwellMins)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Breakdown title="By company" rows={report.byCompany.map((c) => [c.company, c.count])} />
        <Breakdown title="By host department" rows={report.byHostDept.map((d) => [d.department, d.count])} />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Visitor</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Host</th>
              <th className="px-3 py-2 font-medium">Vehicle</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Arrival</th>
              <th className="px-3 py-2 text-right font-medium">Checkout</th>
              <th className="px-3 py-2 text-right font-medium">Dwell</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.rows.map((r: VisitorRow, i) => (
              <tr key={`${r.visit_date}-${i}`}>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.visit_date}</td>
                <td className="px-3 py-1.5 font-medium">{r.name}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.company ?? "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.host ?? "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{vehicle(r)}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{STATUS_LABEL[r.status] ?? r.status}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{clock(r.check_in_at)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{clock(r.check_out_at)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{dur(r.dwellMins)}</td>
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  No visits in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
          {rows.length === 0 && <tr><td className="py-4 text-center text-muted-foreground">No data.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "amber" | "green" }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        tone === "amber" && "border-amber-300 bg-amber-50",
        tone === "green" && "border-green-300 bg-green-50",
      )}
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
