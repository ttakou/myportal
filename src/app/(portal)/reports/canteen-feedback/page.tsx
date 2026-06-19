import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getCanteenFeedback, getDepartments } from "@/lib/reports";
import { ISSUE_LABEL, type IssueType } from "@/types/feedback";
import { cn } from "@/lib/utils";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
const issueLabel = (s: string) => ISSUE_LABEL[s as IssueType] ?? s;

export default async function CanteenFeedbackReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; department?: string }>;
}) {
  const access = await getAccess();
  if (!(access.isSystemAdmin || access.isAdmin || access.isHr || access.isCanteenManager)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">
          This report is available to HR, canteen management and administrators.
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
  const department = sp.department || null;

  const [departments, report] = await Promise.all([
    getDepartments(),
    getCanteenFeedback({ from, to, department }),
  ]);

  const csv: string[][] = [
    ["Date", "Person", "Department", "Food", "Quantity", "Issue", "Status", "Comment"],
    ...report.rows.map((r) => [
      r.service_date,
      r.person ?? "",
      r.department ?? "",
      r.food != null ? String(r.food) : "",
      r.quantity != null ? String(r.quantity) : "",
      issueLabel(r.issue),
      r.status,
      r.comment ?? "",
    ]),
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
          <CsvExportButton filename={`canteen-feedback-${from}_${to}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="Canteen feedback"
        subtitle="Food/quantity ratings, issue breakdown and feedback entries over the period."
        meta={meta}
      />

      <div className="print:hidden">
        <ReportFilters show={{ period: true, department: true }} departments={departments} from={from} to={to} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Feedback entries" value={String(report.summary.count)} />
        <Kpi label="Avg food" value={report.summary.avgFood != null ? `${report.summary.avgFood}/5` : "—"} />
        <Kpi label="Avg quantity" value={report.summary.avgQuantity != null ? `${report.summary.avgQuantity}/5` : "—"} />
        <Kpi label="Unresolved" value={String(report.summary.unresolved)} tone={report.summary.unresolved > 0 ? "amber" : undefined} />
      </div>

      {report.byIssue.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">By issue</div>
          <div className="flex flex-wrap gap-2">
            {report.byIssue.map((b) => (
              <span key={b.issue} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                {issueLabel(b.issue)}: <span className="font-semibold">{b.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Person</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 text-right font-medium">Food</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 font-medium">Issue</th>
              <th className="px-3 py-2 font-medium">Comment</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.rows.map((r, i) => (
              <tr key={`${r.service_date}-${i}`} className={cn(r.status === "open" && r.issue !== "none" && "bg-amber-50")}>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.service_date}</td>
                <td className="px-3 py-1.5 font-medium">{r.person ?? "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.department ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.food ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.quantity ?? "—"}</td>
                <td className="px-3 py-1.5">{issueLabel(r.issue)}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.comment ?? "—"}</td>
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No feedback in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", tone === "amber" && value !== "0" && "border-amber-300 bg-amber-50")}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
