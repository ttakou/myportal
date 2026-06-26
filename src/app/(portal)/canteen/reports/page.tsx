import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getReportData } from "@/lib/canteen-reports";
import { ISSUE_LABEL, type IssueType } from "@/types/feedback";

const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function CanteenReportsPage() {
  const access = await getAccess();
  if (!access.isFinance && !access.isCanteenManager && !access.isHrCanteen) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Management only</h1>
        <Link href="/canteen" className="text-sm font-medium text-primary hover:underline">
          ← Back to the canteen
        </Link>
      </div>
    );
  }

  const r = await getReportData();
  const collectRate = r.booked > 0 ? Math.round((r.collected / r.booked) * 100) : 0;
  const maxDept = Math.max(1, ...r.byDept.map((d) => d.collected));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/canteen" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Canteen
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Canteen reports</h1>
        <p className="text-muted-foreground">{r.periodLabel} · management overview</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Served today" value={String(r.servedToday)} />
        <Stat label="Booked vs collected" value={`${r.collected}/${r.booked}`} sub={`${collectRate}% collected`} />
        <Stat label="No-show rate" value={`${r.noShowRate}%`} sub={`${r.missed} missed`} />
        <Stat label="Waste rate" value={`${r.wasteRate}%`} sub="uncollected prepared" />
        <Stat label="Avg satisfaction" value={r.avgFood != null ? `${r.avgFood}/5` : "—"} sub={`${r.feedbackCount} reviews`} />
        <Stat label="Cost / meal" value={money(r.costPerMeal)} />
        <Stat label="Est. monthly cost" value={money(r.monthCost)} sub={`${r.collected} meals`} />
        <Stat label="Monthly subsidy" value={money(r.monthSubsidy)} sub={`${money(r.subsidyPerMeal)}/meal`} />
      </div>

      {/* Department consumption */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Department consumption</h2>
        {r.byDept.length === 0 ? (
          <p className="text-sm text-muted-foreground">No collected meals this period.</p>
        ) : (
          <div className="space-y-2 rounded-lg border bg-card p-4">
            {r.byDept.map((d) => (
              <div key={d.department} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm">{d.department}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(d.collected / maxDept) * 100}%` }} />
                </div>
                <span className="w-10 text-right text-sm tabular-nums">{d.collected}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Satisfaction + incidents */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-medium">Satisfaction</h3>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Food quality</span><span>{r.avgFood != null ? `${r.avgFood} / 5` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quantity</span><span>{r.avgQty != null ? `${r.avgQty} / 5` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Reviews</span><span>{r.feedbackCount}</span></div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-medium">Incidents</h3>
          {r.incidents.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No incidents reported.</p>
          ) : (
            <div className="mt-2 space-y-1 text-sm">
              {r.incidents.map((i) => (
                <div key={i.type} className="flex justify-between">
                  <span className="text-muted-foreground">{ISSUE_LABEL[i.type as IssueType] ?? i.type}</span>
                  <span>{i.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
