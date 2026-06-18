import Link from "next/link";
import { ShieldX } from "lucide-react";
import { getAccess } from "@/lib/auth";
import { getExecMetrics, getPerformanceMetrics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

function Kpi({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: "amber" | "green" }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", tone === "amber" && "border-amber-300 bg-amber-50", tone === "green" && "border-green-300 bg-green-50")}>
      <div className={cn("text-3xl font-semibold tabular-nums", tone === "amber" && "text-amber-700", tone === "green" && "text-green-700")}>{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Executive dashboard: cross-module KPIs for admins. */
export default async function AnalyticsPage() {
  const access = await getAccess();
  if (!access.isAdmin && !access.isSystemAdmin) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Administrators only</h1>
        <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">← Back to dashboard</Link>
      </div>
    );
  }
  const [m, perf] = await Promise.all([getExecMetrics(), getPerformanceMetrics()]);
  const maxBucket = Math.max(1, ...perf.distribution.map((d) => d.count));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Executive dashboard</h1>
        <p className="text-muted-foreground">Cross-module KPIs at a glance.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Offshore</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Persons on board" value={m.pob} hint={`${m.onboardStaff} staff · ${m.visitorsOnboard} visitors`} />
          <Kpi label="Active crews" value={m.activeCrews} />
          <Kpi label="Certs expiring (30d)" value={m.certExpiring} tone={m.certExpiring > 0 ? "amber" : undefined} />
          <Kpi label="Pending visit requests" value={m.pendingVisits} tone={m.pendingVisits > 0 ? "amber" : undefined} />
        </div>
        {m.installations.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {m.installations.map((i) => {
              const over = i.capacity > 0 && i.pob > i.capacity;
              return (
                <div key={i.name} className="rounded-lg border bg-card p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{i.name}</span>
                    <span className={cn("font-semibold", over && "text-destructive")}>
                      {i.pob}{i.capacity > 0 ? ` / ${i.capacity}` : ""}
                    </span>
                  </div>
                  {i.capacity > 0 && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full", over ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, (i.pob / i.capacity) * 100)}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">People & services</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Active employees" value={m.activeEmployees} />
          <Kpi label="Transport requests" value={m.transportRequests} />
          <Kpi label="Canteen bookings" value={m.canteenBookings} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Performance{perf.cycle ? ` — ${perf.cycle.name}` : ""}
        </h2>
        {perf.cycle ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Appraisals" value={perf.total} />
              <Kpi
                label="Completion"
                value={`${perf.completionPct}%`}
                tone={perf.completionPct >= 90 ? "green" : undefined}
              />
              <Kpi
                label="Pending"
                value={perf.pending}
                tone={perf.pending > 0 ? "amber" : undefined}
              />
              <Kpi label="Avg rating" value={perf.avgRating ?? "—"} hint="out of 5" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border bg-card p-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Rating distribution
                </div>
                <div className="space-y-1.5">
                  {perf.distribution.map((d) => (
                    <div key={d.label} className="flex items-center gap-2 text-sm">
                      <span className="w-3 text-muted-foreground">{d.label}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${(d.count / maxBucket) * 100}%` }}
                        />
                      </div>
                      <span className="w-6 text-right tabular-nums text-muted-foreground">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Year-over-year
                </div>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-1 font-medium">Year</th>
                      <th className="py-1 font-medium">Avg rating</th>
                      <th className="py-1 font-medium">Completion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {perf.trend.map((t) => (
                      <tr key={t.year}>
                        <td className="py-1 tabular-nums">{t.year}</td>
                        <td className="py-1 tabular-nums">{t.avgRating ?? "—"}</td>
                        <td className="py-1 tabular-nums">{t.completionPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  By department
                </div>
                {perf.byDept.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="py-1 font-medium">Department</th>
                        <th className="py-1 font-medium">Rated</th>
                        <th className="py-1 font-medium">Avg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {perf.byDept.map((d) => (
                        <tr key={d.department}>
                          <td className="py-1">{d.department}</td>
                          <td className="py-1 tabular-nums">{d.count}</td>
                          <td className="py-1 tabular-nums">{d.avg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-muted-foreground">No rated appraisals yet.</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No appraisal cycle yet.
          </p>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Figures are live and scoped to your tenant. Offshore POB combines on-board staff trips and on-board visitors.
      </p>
    </div>
  );
}
