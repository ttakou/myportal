import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import {
  getDepartments,
  getReportPeople,
  getSavingsReport,
  type SavingsReportRow,
} from "@/lib/reports";
import { money } from "@/types/savings";
import { cn } from "@/lib/utils";
import { ProgressiveTableBody } from "@/components/ui/progressive-list";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function SavingsReportPage({
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
  // Period filters the activity (contributions/interest/withdrawals); balance is
  // always the current balance. Blank period means year-to-date.
  const from = sp.from || iso(new Date(new Date().getFullYear(), 0, 1));
  const to = sp.to || iso(new Date());
  const department = sp.department || null;
  const userId = sp.user || null;

  const [departments, people, report] = await Promise.all([
    getDepartments(),
    getReportPeople(),
    getSavingsReport({ from, to, department, userId }),
  ]);

  const fmtRow = (r: SavingsReportRow) => [
    r.member ?? "",
    r.department ?? "",
    String(r.balance),
    String(r.contributions),
    String(r.interest),
    String(r.withdrawals),
    String(r.net),
  ];
  const csv: string[][] = [
    ["Member", "Department", "Balance", "Contributions", "Interest", "Withdrawals", "Net"],
    ...report.rows.map(fmtRow),
  ];

  const meta = [
    `Activity: ${from} → ${to}`,
    department ? `Department: ${department}` : "All departments",
    userId ? `Member: ${people.find((p) => p.id === userId)?.name ?? "—"}` : "All members",
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
          <CsvExportButton filename="savings-withdrawals.csv" table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="Savings & withdrawals"
        subtitle="Member savings balances with contributions, interest and withdrawals over the selected period. Amounts in XAF."
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
        <Kpi label="Members" value={String(report.summary.members)} />
        <Kpi label="Total balance" value={money(report.summary.balance)} />
        <Kpi label="Withdrawals" value={money(report.summary.withdrawals)} />
        <Kpi label="Interest" value={money(report.summary.interest)} tone="green" />
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
                <th className="py-1.5 font-medium">Members</th>
                <th className="py-1.5 text-right font-medium">Balance</th>
                <th className="py-1.5 text-right font-medium">Withdrawals</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.byDept.map((d) => (
                <tr key={d.department}>
                  <td className="py-1.5">{d.department}</td>
                  <td className="py-1.5 tabular-nums">{d.members}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(d.balance)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(d.withdrawals)}</td>
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
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 text-right font-medium">Balance</th>
              <th className="px-3 py-2 text-right font-medium">Contributions</th>
              <th className="px-3 py-2 text-right font-medium">Interest</th>
              <th className="px-3 py-2 text-right font-medium">Withdrawals</th>
              <th className="px-3 py-2 text-right font-medium">Net</th>
            </tr>
          </thead>
          <ProgressiveTableBody colSpan={7} className="divide-y" label="Show more members">
            {report.rows.map((r) => (
              <tr key={r.profile_id}>
                <td className="px-3 py-1.5 font-medium">{r.member ?? "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.department ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">{money(r.balance)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-green-700">{money(r.contributions)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-green-700">{money(r.interest)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-red-700">{money(r.withdrawals)}</td>
                <td className={cn("px-3 py-1.5 text-right tabular-nums", r.net < 0 && "text-destructive")}>
                  {money(r.net)}
                </td>
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No savings accounts match these filters.
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
