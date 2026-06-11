import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMyLunchHistory } from "@/lib/canteen";
import {
  LUNCH_OUTCOME_LABEL,
  type LunchHistoryRow,
  type LunchOutcome,
} from "@/types/canteen";
import { cn } from "@/lib/utils";

const OUTCOME_STYLE: Record<LunchOutcome, string> = {
  booked: "bg-accent text-accent-foreground",
  collected: "bg-green-100 text-green-700",
  missed: "bg-amber-100 text-amber-700",
  cancelled: "bg-destructive/10 text-destructive",
};

export default async function LunchHistoryPage() {
  const rows = await getMyLunchHistory();

  const totals: Record<LunchOutcome, number> = {
    booked: 0,
    collected: 0,
    missed: 0,
    cancelled: 0,
  };
  for (const r of rows) totals[r.outcome]++;

  // Monthly consumption summary (collected = consumed).
  const byMonth = new Map<string, Record<LunchOutcome, number>>();
  for (const r of rows) {
    const m = r.service_date.slice(0, 7); // YYYY-MM
    const acc =
      byMonth.get(m) ?? { booked: 0, collected: 0, missed: 0, cancelled: 0 };
    acc[r.outcome]++;
    byMonth.set(m, acc);
  }
  const months = [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/canteen"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Canteen
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Lunch history</h1>
        <p className="text-muted-foreground">Your meals and monthly consumption.</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["booked", "collected", "missed", "cancelled"] as LunchOutcome[]).map((o) => (
          <div key={o} className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{LUNCH_OUTCOME_LABEL[o]}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{totals[o]}</p>
          </div>
        ))}
      </div>

      {/* Monthly consumption summary */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Monthly consumption</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Month</th>
                <th className="px-4 py-3 font-medium text-right">Collected</th>
                <th className="px-4 py-3 font-medium text-right">Booked</th>
                <th className="px-4 py-3 font-medium text-right">Missed</th>
                <th className="px-4 py-3 font-medium text-right">Cancelled</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {months.map(([m, c]) => (
                <tr key={m}>
                  <td className="px-4 py-3 font-medium">
                    {new Date(m + "-01T00:00:00").toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-700">{c.collected}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.booked}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-700">{c.missed}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-destructive">{c.cancelled}</td>
                </tr>
              ))}
              {months.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No history yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detailed list */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">All meals</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Dish &amp; choice</th>
                <th className="px-4 py-3 font-medium">Kitchen</th>
                <th className="px-4 py-3 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r: LunchHistoryRow) => (
                <tr key={r.booking_id}>
                  <td className="px-4 py-3 text-muted-foreground">{r.service_date}</td>
                  <td className="px-4 py-3">
                    {r.dish_name}
                    {r.options && <span className="text-muted-foreground"> — {r.options}</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.kitchen_name}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", OUTCOME_STYLE[r.outcome])}>
                      {LUNCH_OUTCOME_LABEL[r.outcome]}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No meals booked yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
