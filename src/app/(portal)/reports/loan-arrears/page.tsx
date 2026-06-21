import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import {
  getDepartments,
  getLoanArrearsReport,
  getReportPeople,
  type LoanArrearsRow,
} from "@/lib/reports";
import { cn } from "@/lib/utils";
import { ProgressiveTableBody } from "@/components/ui/progressive-list";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function LoanArrearsReportPage({
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
  // Period (loan start date) is optional here; blank means all loans.
  const from = sp.from || "1900-01-01";
  const to = sp.to || iso(new Date());
  const department = sp.department || null;
  const userId = sp.user || null;

  const [departments, people, report] = await Promise.all([
    getDepartments(),
    getReportPeople(),
    getLoanArrearsReport({ from, to, department, userId }),
  ]);

  const fmtRow = (r: LoanArrearsRow) => [
    r.borrower ?? "",
    r.department ?? "",
    r.start_date,
    r.status,
    String(r.principal),
    String(r.outstanding),
    String(r.monthly_payment),
    String(r.actual_paid),
    String(r.arrears),
    String(r.savings_balance),
  ];
  const csv: string[][] = [
    ["Borrower", "Department", "Start", "Status", "Principal", "Outstanding", "Monthly", "Paid", "Arrears", "Savings"],
    ...report.rows.map(fmtRow),
  ];

  const meta = [
    sp.from || sp.to ? `Loans started: ${sp.from ?? "…"} → ${sp.to ?? "…"}` : "All loans",
    department ? `Department: ${department}` : "All departments",
    userId ? `Borrower: ${people.find((p) => p.id === userId)?.name ?? "—"}` : "All borrowers",
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
          <CsvExportButton filename="loan-arrears.csv" table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="Savings & loan arrears"
        subtitle="Loan portfolio with arrears (scheduled-to-date minus repayments, for active loans) and savings balances."
        meta={meta}
      />

      <div className="print:hidden">
        <ReportFilters
          show={{ period: true, department: true, user: true }}
          departments={departments}
          users={people}
          from={sp.from}
          to={sp.to}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Loans" value={String(report.summary.loans)} />
        <Kpi label="Outstanding" value={money(report.summary.outstanding)} />
        <Kpi label="Arrears" value={money(report.summary.arrears)} tone={report.summary.arrears > 0 ? "red" : "green"} />
        <Kpi label="In arrears" value={String(report.summary.inArrears)} tone={report.summary.inArrears > 0 ? "red" : "green"} />
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
                <th className="py-1.5 font-medium">Loans</th>
                <th className="py-1.5 text-right font-medium">Outstanding</th>
                <th className="py-1.5 text-right font-medium">Arrears</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.byDept.map((d) => (
                <tr key={d.department}>
                  <td className="py-1.5">{d.department}</td>
                  <td className="py-1.5 tabular-nums">{d.loans}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(d.outstanding)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(d.arrears)}</td>
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
              <th className="px-3 py-2 font-medium">Borrower</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Outstanding</th>
              <th className="px-3 py-2 text-right font-medium">Monthly</th>
              <th className="px-3 py-2 text-right font-medium">Paid</th>
              <th className="px-3 py-2 text-right font-medium">Arrears</th>
              <th className="px-3 py-2 text-right font-medium">Savings</th>
            </tr>
          </thead>
          <ProgressiveTableBody colSpan={8} className="divide-y" label="Show more loans">
            {report.rows.map((r) => (
              <tr key={r.loan_id} className={cn(r.arrears > 0 && "bg-destructive/5")}>
                <td className="px-3 py-1.5 font-medium">{r.borrower ?? "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.department ?? "—"}</td>
                <td className="px-3 py-1.5 capitalize text-muted-foreground">{r.status}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(r.outstanding)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(r.monthly_payment)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(r.actual_paid)}</td>
                <td className={cn("px-3 py-1.5 text-right tabular-nums", r.arrears > 0 && "font-semibold text-destructive")}>
                  {money(r.arrears)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(r.savings_balance)}</td>
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  No loans match these filters.
                </td>
              </tr>
            )}
          </ProgressiveTableBody>
        </table>
      </div>
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
