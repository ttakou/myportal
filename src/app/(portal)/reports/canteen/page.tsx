import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getCanteenReport, getDepartments } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

const MEAL_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

export default async function CanteenReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; department?: string }>;
}) {
  const access = await getAccess();
  if (
    !(
      access.isSystemAdmin ||
      access.isAdmin ||
      access.isFinance ||
      access.isCanteenManager ||
      access.isHrCanteen ||
      access.isOim
    )
  ) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-muted-foreground">
          This report is available to canteen management, the camp boss, HR/finance and administrators.
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
    getCanteenReport({ from, to, department }),
  ]);

  const csv: string[][] = [
    ["Department", "Served", "No-show"],
    ...report.byDept.map((d) => [d.department, String(d.served), String(d.noShow)]),
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
          <CsvExportButton filename={`canteen-consumption-${from}_${to}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="Canteen consumption & no-show"
        subtitle="Served vs no-show vs cancelled over the period, with department and meal-period breakdowns."
        meta={meta}
      />

      <div className="print:hidden">
        <ReportFilters show={{ period: true, department: true }} departments={departments} from={from} to={to} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Served" value={String(report.summary.served)} tone="green" />
        <Kpi label="No-shows" value={String(report.summary.noShow)} tone={report.summary.noShow > 0 ? "amber" : undefined} />
        <Kpi label="No-show rate" value={`${report.summary.noShowRate}%`} tone={report.summary.noShowRate >= 15 ? "red" : undefined} />
        <Kpi label="Cancelled" value={String(report.summary.cancelled)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            By meal period
          </div>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Meal</th>
                <th className="py-1.5 text-right font-medium">Served</th>
                <th className="py-1.5 text-right font-medium">No-show</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.byMeal.map((m) => (
                <tr key={m.meal}>
                  <td className="py-1.5">{MEAL_LABEL[m.meal] ?? m.meal}</td>
                  <td className="py-1.5 text-right tabular-nums">{m.served}</td>
                  <td className="py-1.5 text-right tabular-nums">{m.noShow}</td>
                </tr>
              ))}
              {report.byMeal.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            By department
          </div>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Department</th>
                <th className="py-1.5 text-right font-medium">Served</th>
                <th className="py-1.5 text-right font-medium">No-show</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.byDept.map((d) => (
                <tr key={d.department}>
                  <td className="py-1.5">{d.department}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.served}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.noShow}</td>
                </tr>
              ))}
              {report.byDept.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          By person (consumption)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Name</th>
                <th className="py-1.5 font-medium">Department</th>
                <th className="py-1.5 text-right font-medium">Served</th>
                <th className="py-1.5 text-right font-medium">No-show</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.byPerson.map((p, i) => (
                <tr key={`${p.name}-${i}`}>
                  <td className="py-1.5 font-medium">{p.name ?? "—"}</td>
                  <td className="py-1.5 text-muted-foreground">{p.department ?? "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.served}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.noShow}</td>
                </tr>
              ))}
              {report.byPerson.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No consumption in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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
