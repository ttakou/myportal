import Link from "next/link";
import { AlertTriangle, Landmark, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExecutiveSummary } from "@/lib/training";
import { PrintButton } from "../../reports/_components/print-button";
import { ReportHeader } from "../../reports/_components/report-header";
import { ReportStampFooter } from "../../reports/_components/report-stamp-footer";

/**
 * One-page executive summary of a training year: budget vs committed/delivered
 * spend, where the money goes (department, course, month) and annual-plan
 * progress. Server-rendered; prints via the shared branded letterhead.
 */

const PLAN_STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
const PLAN_SOURCE_LABEL: Record<string, string> = {
  mandatory: "Statutory / mandatory",
  request: "Employee requests",
  manager: "Manager nominations",
  development: "Development plans",
};

function money(n: number, currency: string): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)} ${currency}`;
}

/** Budget-utilisation meter: green under, amber near, red over. */
function Meter({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">no budget set</span>;
  const clamped = Math.min(pct, 100);
  const tone = pct > 100 ? "bg-red-500" : pct > 85 ? "bg-amber-500" : "bg-green-500";
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-28 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${clamped}%` }} />
      </span>
      <span className={cn("text-xs tabular-nums", pct > 100 ? "font-semibold text-destructive" : "text-muted-foreground")}>
        {Math.round(pct)}%
      </span>
    </span>
  );
}

/** Monthly committed-spend bars — single series, one hue, no legend needed. */
function MonthlySpend({ months, currency }: { months: { month: string; cost: number }[]; currency: string }) {
  const max = Math.max(...months.map((m) => m.cost), 1);
  const W = 960, H = 170, PAD = { top: 12, right: 8, bottom: 22, left: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = innerW / 12;
  const barW = Math.min(40, step - 8);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Committed training spend per month"
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.3} />
      {months.map((m, i) => {
        const x = PAD.left + i * step + (step - barW) / 2;
        const h = y(0) - y(m.cost);
        return (
          <g key={m.month}>
            <title>{`${m.month} — ${money(m.cost, currency)}`}</title>
            {m.cost > 0 && (
              <rect x={x} y={y(m.cost)} width={barW} height={Math.max(h, 1)} rx={3} fill="#dc2626" />
            )}
            {/* Selective direct labels: only meaningful bars, not every point. */}
            {m.cost > 0 && m.cost >= max * 0.15 && (
              <text x={x + barW / 2} y={y(m.cost) - 4} textAnchor="middle" fontSize={9.5}
                fill="currentColor" fillOpacity={0.7}>
                {Intl.NumberFormat("en", { notation: "compact" }).format(m.cost)}
              </text>
            )}
            <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={9.5} fill="currentColor" fillOpacity={0.55}>
              {new Date(`${m.month}-01T00:00:00Z`).toLocaleString("en", { month: "short", timeZone: "UTC" })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ExecSummaryPanel({ data }: { data: ExecutiveSummary }) {
  const { year, years, currency, budget, spend, plan, peopleTrained } = data;
  const remaining = budget.total - spend.committed;
  const utilisation = budget.total > 0 ? (spend.committed / budget.total) * 100 : null;
  const planDone = plan.byStatus.find((s) => s.status === "completed")?.count ?? 0;
  const planPct = plan.total > 0 ? Math.round((planDone / plan.total) * 100) : 0;

  // Budget vs pro-rated spend, joined by department (spend rows without a
  // budget line still show — that IS the "where is it going" answer).
  const budgetByDept = new Map(budget.byDepartment.map((b) => [b.department, b.amount]));
  const deptRows = spend.byDepartment.map((d) => ({
    department: d.department,
    committed: d.committed,
    budget: budgetByDept.get(d.department) ?? null,
  }));
  for (const b of budget.byDepartment) {
    if (!deptRows.some((r) => r.department === b.department)) {
      deptRows.push({ department: b.department, committed: 0, budget: b.amount });
    }
  }

  const topCourses = spend.byCourse.slice(0, 8);
  const otherCost = spend.byCourse.slice(8).reduce((s, c) => s + c.cost, 0);

  const tiles = [
    { label: `Budget ${year}`, value: money(budget.total, currency), icon: Landmark },
    { label: "Committed", value: money(spend.committed, currency), icon: TrendingUp, hint: utilisation != null ? `${Math.round(utilisation)}% of budget` : undefined },
    { label: "Delivered", value: money(spend.delivered, currency), hint: "completed sessions" },
    { label: "Remaining", value: money(remaining, currency), alert: remaining < 0 },
    { label: "Plan items", value: `${planDone}/${plan.total}`, hint: `${planPct}% complete` },
    { label: "People trained", value: String(peopleTrained), icon: Users },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <label className="text-xs text-muted-foreground">
          Year
          <div className="mt-1 flex gap-1">
            {years.map((y) => (
              <Link key={y} href={`/training?view=exec-summary&year=${y}`}
                className={cn("rounded-md border px-3 py-1.5 text-sm font-medium",
                  y === year ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}>
                {y}
              </Link>
            ))}
          </div>
        </label>
        <PrintButton />
      </div>

      <div className="hidden print:block">
        <ReportHeader title={`Training Executive Summary ${year}`}
          subtitle="Annual plan & budget" meta={[`Budget ${money(budget.total, currency)}`, `Committed ${money(spend.committed, currency)}`]} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className={cn("rounded-lg border bg-card p-3", t.alert && "border-destructive/50 bg-destructive/5")}>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {t.icon && <t.icon className="h-3.5 w-3.5" />} {t.label}
            </p>
            <p className={cn("text-xl font-semibold tabular-nums", t.alert && "text-destructive")}>{t.value}</p>
            {t.hint && <p className="text-[11px] text-muted-foreground">{t.hint}</p>}
            {t.alert && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
                <AlertTriangle className="h-3 w-3" /> over budget
              </p>
            )}
          </div>
        ))}
      </div>

      <section className="rounded-lg border bg-card p-4 break-inside-avoid">
        <h2 className="mb-1 text-sm font-semibold">Monthly committed spend</h2>
        <p className="mb-2 text-xs text-muted-foreground">Session costs by start month, {currency}.</p>
        <MonthlySpend months={spend.byMonth} currency={currency} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-card p-4 break-inside-avoid">
          <h2 className="mb-1 text-sm font-semibold">Where the money goes — by department</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Session costs pro-rated across participants&apos; departments, against each department&apos;s budget line.
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Department</th>
                <th className="py-1.5 text-right font-medium">Spend</th>
                <th className="py-1.5 text-right font-medium">Budget</th>
                <th className="py-1.5 pl-4 font-medium">Utilisation</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {deptRows.map((d) => (
                <tr key={d.department}>
                  <td className="py-1.5 font-medium">{d.department}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(d.committed, currency)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {d.budget != null ? money(d.budget, currency) : "—"}
                  </td>
                  <td className="py-1.5 pl-4">
                    <Meter pct={d.budget != null && d.budget > 0 ? (d.committed / d.budget) * 100 : null} />
                  </td>
                </tr>
              ))}
              {deptRows.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No budget lines or spend for {year} yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border bg-card p-4 break-inside-avoid">
          <h2 className="mb-1 text-sm font-semibold">Where the money goes — by course</h2>
          <p className="mb-3 text-xs text-muted-foreground">Top courses by committed session cost.</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Course</th>
                <th className="py-1.5 text-right font-medium">Sessions</th>
                <th className="py-1.5 text-right font-medium">Cost</th>
                <th className="py-1.5 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {topCourses.map((c) => (
                <tr key={c.title}>
                  <td className="py-1.5">{c.title}</td>
                  <td className="py-1.5 text-right tabular-nums">{c.sessions}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(c.cost, currency)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {spend.committed > 0 ? `${Math.round((c.cost / spend.committed) * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
              {otherCost > 0 && (
                <tr>
                  <td className="py-1.5 text-muted-foreground">Other ({spend.byCourse.length - 8} courses)</td>
                  <td className="py-1.5" />
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{money(otherCost, currency)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {spend.committed > 0 ? `${Math.round((otherCost / spend.committed) * 100)}%` : "—"}
                  </td>
                </tr>
              )}
              {topCourses.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No costed sessions in {year}.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <section className="rounded-lg border bg-card p-4 break-inside-avoid">
        <h2 className="mb-3 text-sm font-semibold">Annual plan progress</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs text-muted-foreground">By status ({plan.total} items)</p>
            <ul className="space-y-1.5">
              {plan.byStatus.sort((a, b) => b.count - a.count).map((s) => (
                <li key={s.status} className="flex items-center justify-between gap-3 text-sm">
                  <span>{PLAN_STATUS_LABEL[s.status] ?? s.status}</span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                      <span className={cn("block h-full rounded-full",
                        s.status === "completed" ? "bg-green-500" : s.status === "cancelled" ? "bg-red-400" : "bg-sky-500")}
                        style={{ width: `${plan.total ? (s.count / plan.total) * 100 : 0}%` }} />
                    </span>
                    <span className="w-8 text-right tabular-nums">{s.count}</span>
                  </span>
                </li>
              ))}
              {plan.byStatus.length === 0 && <li className="text-sm text-muted-foreground">No plan items for {year}.</li>}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs text-muted-foreground">Where the plan comes from</p>
            <ul className="space-y-1.5">
              {plan.bySource.sort((a, b) => b.count - a.count).map((s) => (
                <li key={s.source} className="flex items-center justify-between text-sm">
                  <span>{PLAN_SOURCE_LABEL[s.source] ?? s.source}</span>
                  <span className="tabular-nums">{s.count}</span>
                </li>
              ))}
              {plan.bySource.length === 0 && <li className="text-sm text-muted-foreground">—</li>}
            </ul>
          </div>
        </div>
      </section>

      <div className="hidden print:block">
        <ReportStampFooter label="Executive Summary" />
      </div>
    </div>
  );
}
