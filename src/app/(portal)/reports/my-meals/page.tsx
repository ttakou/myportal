import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMyMeals } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { ProgressiveTableBody } from "@/components/ui/progressive-list";
import { ReportFilters } from "../_components/report-filters";
import { CsvExportButton } from "../_components/csv-export-button";
import { PrintButton } from "../_components/print-button";
import { ReportHeader } from "../_components/report-header";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

const MEAL_LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
const STATUS_LABEL: Record<string, string> = { served: "Collected", booked: "Booked", cancelled: "Cancelled" };

export default async function MyMealsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const from = sp.from || iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); // month-to-date
  const to = sp.to || iso(new Date());

  const report = await getMyMeals({ from, to });

  const label = (s: string, sd: string) =>
    s === "booked" && sd < iso(new Date()) ? "No-show" : STATUS_LABEL[s] ?? s;

  const csv: string[][] = [
    ["Date", "Meal", "Status"],
    ...report.rows.map((r) => [r.service_date, MEAL_LABEL[r.meal] ?? r.meal, label(r.status, r.service_date)]),
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
          <CsvExportButton filename={`my-meals-${from}_${to}.csv`} table={csv} />
          <PrintButton />
        </div>
      </div>

      <ReportHeader
        title="My meals"
        subtitle="Your canteen bookings and collections over the period."
        meta={[`Period: ${from} → ${to}`]}
      />

      <div className="print:hidden">
        <ReportFilters show={{ period: true }} from={from} to={to} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Collected" value={report.summary.served} tone="green" />
        <Kpi label="No-shows" value={report.summary.noShow} tone={report.summary.noShow > 0 ? "amber" : undefined} />
        <Kpi label="Upcoming" value={report.summary.booked} />
        <Kpi label="Cancelled" value={report.summary.cancelled} />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Meal</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <ProgressiveTableBody colSpan={3} className="divide-y" label="Show more rows">
            {report.rows.map((r, i) => (
              <tr key={`${r.service_date}-${r.meal}-${i}`}>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.service_date}</td>
                <td className="px-3 py-1.5">{MEAL_LABEL[r.meal] ?? r.meal}</td>
                <td className="px-3 py-1.5">{label(r.status, r.service_date)}</td>
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                  No meals booked in this period.
                </td>
              </tr>
            )}
          </ProgressiveTableBody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "amber" | "green" }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        tone === "amber" && value > 0 && "border-amber-300 bg-amber-50",
        tone === "green" && "border-green-300 bg-green-50",
      )}
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
