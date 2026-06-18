import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getDepartments, getOffshoreCertReport, type CertCell, type CertStatus } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";

const STATUS_STYLE: Record<CertStatus, string> = {
  expired: "bg-destructive/10 text-destructive",
  missing: "bg-destructive/10 text-destructive",
  expiring: "bg-amber-100 text-amber-800",
  valid: "bg-green-100 text-green-700",
};

function Cell({ cell }: { cell: CertCell }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", STATUS_STYLE[cell.status])}>
      {cell.status === "missing" ? "—" : cell.date}
    </span>
  );
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function OffshoreCertReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; department?: string }>;
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
  const from = sp.from || iso(new Date());
  const to = sp.to || iso(new Date(Date.now() + 90 * 86_400_000));
  const department = sp.department || null;

  const [departments, report] = await Promise.all([
    getDepartments(),
    getOffshoreCertReport({ from, to, department }),
  ]);

  const csv: string[][] = [
    ["Name", "Department", "Company", "Position", "Medical", "BOSIET", "HUET", "Status"],
    ...report.rows.map((r) => [
      r.name ?? "",
      r.department ?? "",
      r.company ?? "",
      r.position ?? "",
      r.medical.date ?? "missing",
      r.bosiet.date ?? "missing",
      r.huet.date ?? "missing",
      r.worst === "expired" ? "Non-compliant" : r.worst === "expiring" ? "Expiring" : "Valid",
    ]),
  ];

  const meta = [
    `Upcoming-expiry window: ${from} → ${to}`,
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
          <CsvExportButton filename={`offshore-certifications-${from}_${to}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="Offshore certification compliance"
        subtitle="Medical / BOSIET / HUET status as of today. Expired or missing certs are always listed; the period filters which upcoming expiries to include."
        meta={meta}
      />

      <div className="print:hidden">
        <ReportFilters
          show={{ period: true, department: true }}
          departments={departments}
          from={from}
          to={to}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Non-compliant" value={report.summary.nonCompliant} tone="red" />
        <Kpi label="Expiring (30d)" value={report.summary.expiring} tone="amber" />
        <Kpi label="Valid" value={report.summary.valid} tone="green" />
        <Kpi label="In scope" value={report.summary.total} />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Medical</th>
              <th className="px-3 py-2 font-medium">BOSIET</th>
              <th className="px-3 py-2 font-medium">HUET</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.rows.map((r) => (
              <tr key={r.staff_id}>
                <td className="px-3 py-1.5 font-medium">{r.name ?? "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.department ?? "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.company ?? "—"}</td>
                <td className="px-3 py-1.5"><Cell cell={r.medical} /></td>
                <td className="px-3 py-1.5"><Cell cell={r.bosiet} /></td>
                <td className="px-3 py-1.5"><Cell cell={r.huet} /></td>
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No certifications match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "red" | "amber" | "green" }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        tone === "red" && value > 0 && "border-destructive/40 bg-destructive/5",
        tone === "amber" && value > 0 && "border-amber-300 bg-amber-50",
        tone === "green" && "border-green-300 bg-green-50",
      )}
    >
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
