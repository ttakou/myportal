import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import { getCalibrationSession } from "@/lib/calibration-session";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { PotentialSelect } from "./_components/potential-select";

const PERF_LABELS = ["Low perf.", "Med perf.", "High perf."];
const POT_LABELS = ["High potential", "Med potential", "Low potential"];

export default async function CalibrationSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const access = await getAccess();
  if (!(access.isHr || access.isSystemAdmin || access.isAdmin)) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <ShieldX className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold">Not available</h1>
        <Link href="/performance" className="text-sm font-medium text-primary hover:underline">
          ← Back to performance
        </Link>
      </div>
    );
  }

  const supabase = createClient();
  const { data: cyclesRes } = await supabase
    .from("appraisal_cycles")
    .select("id, name, year, status")
    .order("year", { ascending: false });
  const cycles = ((cyclesRes ?? []) as Record<string, unknown>[]).map((c) => ({
    id: String(c.id),
    name: String(c.name ?? c.year ?? ""),
  }));

  const { cycle: cycleParam } = await searchParams;
  const selected = cycleParam && cycles.some((c) => c.id === cycleParam) ? cycleParam : cycles[0]?.id;
  const session = selected ? await getCalibrationSession(selected) : null;
  const maxBar = session ? Math.max(1, ...session.distribution.map((d) => Math.max(d.actualPercent, d.targetPercent ?? 0))) : 1;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/performance/settings/calibration"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Calibration settings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Calibration session</h1>
        <p className="text-muted-foreground">
          Preliminary vs adjusted ratings, distribution against target, and adjustment reasons.
        </p>
      </div>

      {cycles.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {cycles.map((c) => (
            <Link
              key={c.id}
              href={`/performance/calibration?cycle=${c.id}`}
              className={cn(
                buttonVariants({ variant: c.id === selected ? "default" : "outline", size: "sm" }),
              )}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {!session || session.stats.total === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No scored appraisals to calibrate in this cycle yet.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Appraisals" value={String(session.stats.total)} />
            <Stat label="Adjusted" value={`${session.stats.adjusted} (${Math.round((session.stats.adjusted / session.stats.total) * 100)}%)`} />
            <Stat label="Average score" value={session.stats.average != null ? `${session.stats.average}%` : "—"} />
            <Stat
              label="Distribution deviation"
              value={session.stats.deviation != null ? `${session.stats.deviation} pts` : "—"}
              hint="Σ|actual − target| across bands — a bias indicator"
            />
          </div>

          <section className="space-y-2 rounded-lg border bg-card p-5">
            <h2 className="font-medium">Distribution vs target</h2>
            <div className="space-y-2">
              {session.distribution.map((d) => (
                <div key={d.label} className="text-sm">
                  <div className="mb-0.5 flex justify-between">
                    <span>{d.label}</span>
                    <span className="text-muted-foreground">
                      {d.count} · {d.actualPercent}%{d.targetPercent != null ? ` (target ${d.targetPercent}%)` : ""}
                    </span>
                  </div>
                  <div className="relative h-3 w-full rounded bg-muted">
                    <div className="absolute inset-y-0 left-0 rounded bg-primary" style={{ width: `${(d.actualPercent / maxBar) * 100}%` }} />
                    {d.targetPercent != null && (
                      <div className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: `${(d.targetPercent / maxBar) * 100}%` }} title={`Target ${d.targetPercent}%`} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h2 className="mb-2 font-medium">Performance vs potential (9-box)</h2>
            <div className="overflow-x-auto">
              <table className="text-xs">
                <tbody>
                  {session.nineBox.map((row, ri) => (
                    <tr key={ri}>
                      <th className="whitespace-nowrap px-2 py-1 text-left font-medium text-muted-foreground">
                        {POT_LABELS[ri]}
                      </th>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className={cn(
                            "h-20 w-28 align-top border p-1.5",
                            ri === 0 && ci === 2 ? "bg-green-50" : ri === 2 && ci === 0 ? "bg-red-50" : "bg-muted/20",
                          )}
                        >
                          <div className="font-semibold">{cell.count}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {cell.names.slice(0, 3).join(", ")}
                            {cell.names.length > 3 ? ` +${cell.names.length - 3}` : ""}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th />
                    {PERF_LABELS.map((l) => (
                      <th key={l} className="px-2 py-1 text-center font-medium text-muted-foreground">{l}</th>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h2 className="mb-2 font-medium">Ratings</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Employee</th>
                    <th className="py-2 pr-4 font-medium">Preliminary</th>
                    <th className="py-2 pr-4 font-medium">Adjusted</th>
                    <th className="py-2 pr-4 font-medium">Δ</th>
                    <th className="py-2 pr-4 font-medium">Rating</th>
                    <th className="py-2 pr-4 font-medium">Potential</th>
                    {session.confidentiality.showAdjustmentReasons && <th className="py-2 font-medium">Reason</th>}
                  </tr>
                </thead>
                <tbody>
                  {session.rows.map((r) => (
                    <tr key={r.appraisalId} className="border-b last:border-0">
                      <td className="py-2 pr-4">{r.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{r.preliminary != null ? `${r.preliminary}%` : "—"}</td>
                      <td className="py-2 pr-4 font-medium">{r.adjusted != null ? `${r.adjusted}%` : "—"}</td>
                      <td className={cn("py-2 pr-4", (r.delta ?? 0) > 0 ? "text-green-700" : (r.delta ?? 0) < 0 ? "text-destructive" : "text-muted-foreground")}>
                        {r.delta ? (r.delta > 0 ? `+${r.delta}` : r.delta) : "—"}
                      </td>
                      <td className="py-2 pr-4">{r.label ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <PotentialSelect appraisalId={r.appraisalId} value={r.potential} />
                      </td>
                      {session.confidentiality.showAdjustmentReasons && (
                        <td className="py-2 text-muted-foreground">{r.reason ?? "—"}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground" title={hint}>{label}</p>
      <p className="mt-0.5 text-xl font-semibold">{value}</p>
    </div>
  );
}
