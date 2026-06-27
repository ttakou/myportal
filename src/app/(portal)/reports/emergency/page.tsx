import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getEmergencyReport, type EmergencyIncidentRow } from "@/lib/reports";
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
const cap = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const SEV_STYLE: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-muted text-muted-foreground",
};

function dur(mins: number | null): string {
  if (mins == null) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default async function EmergencyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const access = await getAccess();
  if (!(access.isSystemAdmin || access.isAdmin || access.isSafetyAdmin || access.isOim)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">
          This report is available to safety, offshore and system administrators.
        </p>
        <Link href="/reports" className="text-sm font-medium text-primary hover:underline">
          ← Back to reports
        </Link>
      </div>
    );
  }

  const sp = await searchParams;
  const from = sp.from || iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); // month-to-date
  const to = sp.to || iso(new Date());

  const report = await getEmergencyReport({ from, to });

  const csv: string[][] = [
    ["When (UTC)", "Reported by", "Department", "Type", "Severity", "Status", "SOS", "Location", "Ack", "Resolve"],
    ...report.rows.map((r) => [
      new Date(r.created_at).toISOString().slice(0, 16).replace("T", " "),
      r.reporter ?? "",
      r.department ?? "",
      cap(r.type),
      cap(r.severity),
      cap(r.status),
      r.sos ? "Yes" : "",
      r.location ?? "",
      dur(r.ackMins),
      dur(r.resolveMins),
    ]),
  ];

  return (
    <div className="space-y-5">
      {/* Print this report on A3 (wide incident table fits comfortably). */}
      <style>{"@media print { @page { size: A3; margin: 12mm; } }"}</style>
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Reports
        </Link>
        <div className="flex items-center gap-2">
          <CsvExportButton filename={`emergency-incidents-${from}_${to}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="Emergency incidents"
        subtitle="Incidents over the period: volume, SOS, response times and type/severity/status breakdowns."
        meta={[`Period: ${from} → ${to}`]}
      />

      <div className="print:hidden">
        <ReportFilters show={{ period: true }} from={from} to={to} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Incidents" value={String(report.summary.total)} />
        <Kpi label="SOS" value={String(report.summary.sos)} tone={report.summary.sos > 0 ? "red" : undefined} />
        <Kpi label="Open" value={String(report.summary.open)} tone={report.summary.open > 0 ? "amber" : undefined} />
        <Kpi label="Resolved" value={String(report.summary.resolved)} tone="green" />
        <Kpi label="Avg ack" value={dur(report.summary.avgAckMins)} />
        <Kpi label="Avg resolve" value={dur(report.summary.avgResolveMins)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Breakdown title="By type" rows={report.byType.map((t) => [cap(t.type), t.count])} />
        <Breakdown title="By severity" rows={report.bySeverity.map((s) => [cap(s.severity), s.count])} />
        <Breakdown title="By status" rows={report.byStatus.map((s) => [cap(s.status), s.count])} />
      </div>

      <p className="text-xs text-muted-foreground">
        {report.summary.broadcasts} emergency broadcast{report.summary.broadcasts === 1 ? "" : "s"} sent in this period.
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">When (UTC)</th>
              <th className="px-3 py-2 font-medium">Reported by</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Severity</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 text-right font-medium">Ack</th>
              <th className="px-3 py-2 text-right font-medium">Resolve</th>
            </tr>
          </thead>
          <ProgressiveTableBody colSpan={8} className="divide-y" label="Show more incidents">
            {report.rows.map((r: EmergencyIncidentRow, i) => (
              <tr key={`${r.created_at}-${i}`} className={cn(r.sos && "bg-destructive/5")}>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                  {new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")}
                </td>
                <td className="px-3 py-1.5">
                  <span className="font-medium">{r.reporter ?? "—"}</span>
                  {r.department && (
                    <span className="block text-xs text-muted-foreground">{r.department}</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {cap(r.type)}
                  {r.sos && (
                    <span className="ml-2 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-destructive">
                      SOS
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", SEV_STYLE[r.severity] ?? "")}>
                    {cap(r.severity)}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{cap(r.status)}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.location ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{dur(r.ackMins)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{dur(r.resolveMins)}</td>
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  No incidents in this period.
                </td>
              </tr>
            )}
          </ProgressiveTableBody>
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
      <ReportStampFooter />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "red" | "amber" | "green" }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        tone === "red" && "border-destructive/40 bg-destructive/5",
        tone === "amber" && "border-amber-300 bg-amber-50",
        tone === "green" && "border-green-300 bg-green-50",
      )}
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
