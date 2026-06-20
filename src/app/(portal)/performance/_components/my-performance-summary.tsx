import Link from "next/link";
import { ArrowRight, Target, Sprout } from "lucide-react";
import {
  STAGE_LABEL,
  STATUS_LABEL,
  type Appraisal,
} from "@/types/appraisal";
import { cn } from "@/lib/utils";

const DEV_STATUS_LABEL: Record<"planned" | "in_progress" | "done", string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
};

const DEV_STATUS_STYLE: Record<"planned" | "in_progress" | "done", string> = {
  planned: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
};

/**
 * The signed-in user's own performance at a glance on the module home page:
 * one card for their objectives (with where the appraisal stands) and one for
 * their individual development plan (IDP). Both are read-only summaries — the
 * employee opens their appraisal to actually edit and submit.
 */
export function MyPerformanceSummary({
  appraisal,
  cycleName,
  hasCycle,
}: {
  appraisal: Appraisal | null;
  cycleName: string | null;
  hasCycle: boolean;
}) {
  const goals = appraisal?.goals ?? [];
  const idp = appraisal?.development_plan ?? [];
  const totalWeight = goals.reduce((s, g) => s + (g.weight ?? 0), 0);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">My performance</h2>
        <p className="text-sm text-muted-foreground">
          {cycleName ? `Your objectives and development plan · ${cycleName}` : "Your objectives and development plan"}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Goals ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Target className="h-4 w-4 text-primary" /> My goals
            </h3>
            {appraisal && (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {STAGE_LABEL[appraisal.stage]} · {STATUS_LABEL[appraisal.status]}
              </span>
            )}
          </div>

          {goals.length > 0 ? (
            <ul className="divide-y text-sm">
              {goals.map((g) => (
                <li key={g.id} className="py-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="font-medium">{g.title}</span>
                      {g.kind === "development" && (
                        <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                          development
                        </span>
                      )}
                      {g.at_risk && (
                        <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                          at risk
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {g.weight}%
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        g.status === "approved"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {g.status === "approved" ? "Approved" : "Draft"}
                    </span>
                    {g.employee_self_rating != null && <span>self {g.employee_self_rating}/5</span>}
                    {g.manager_rating != null && <span>· mgr {g.manager_rating}/5</span>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex-1 rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              {hasCycle
                ? "You have no objectives yet — open your appraisal to set them."
                : "No active appraisal cycle yet. Your goals will appear here once HR launches one."}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <span
              className={cn(
                "text-xs",
                goals.length > 0 && totalWeight === 100 ? "text-emerald-600" : "text-muted-foreground",
              )}
            >
              {goals.length > 0 ? `Total weight: ${totalWeight}%` : ""}
            </span>
            <Link
              href="/performance/appraisals#my-appraisal"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {goals.length > 0 ? "Open my appraisal" : "Set my objectives"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* ── Individual development plan (IDP) ─────────────────────────── */}
        <div className="flex flex-col rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Sprout className="h-4 w-4 text-primary" /> Development plan (IDP)
            </h3>
            {idp.length > 0 && (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {idp.length} action{idp.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {idp.length > 0 ? (
            <ul className="divide-y text-sm">
              {idp.map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium">{it.area}</div>
                    {it.action && <div className="text-xs text-muted-foreground">{it.action}</div>}
                    <div className="text-xs text-muted-foreground">
                      {it.target_date ? `Target ${it.target_date}` : "No target date"}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      DEV_STATUS_STYLE[it.status],
                    )}
                  >
                    {DEV_STATUS_LABEL[it.status]}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex-1 rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              {appraisal
                ? "No development actions yet — plan how you'll grow this cycle."
                : "Your development actions will appear here during your appraisal."}
            </p>
          )}

          <div className="mt-3 flex items-center justify-end border-t pt-3">
            <Link
              href="/performance/appraisals#development-plan"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {idp.length > 0 ? "Manage my plan" : "Add development actions"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
