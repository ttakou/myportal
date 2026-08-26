import Link from "next/link";
import { PHASE_STATE_LABEL, type CyclePhase } from "@/lib/performance/cycle-phases";
import type { AppraisalCycle } from "@/types/appraisal";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<AppraisalCycle["status"], { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-green-100 text-green-700" },
  draft: { label: "Draft", cls: "bg-amber-100 text-amber-700" },
  closed: { label: "Closed", cls: "bg-muted text-muted-foreground" },
};

const PHASE_CLS: Record<CyclePhase["state"], string> = {
  current: "border-primary bg-primary/5 font-medium text-foreground",
  done: "bg-card text-muted-foreground",
  upcoming: "border-dashed bg-card text-muted-foreground",
};

const PHASE_BADGE: Record<CyclePhase["state"], string> = {
  current: "bg-green-100 text-green-700",
  done: "bg-muted text-muted-foreground",
  upcoming: "bg-muted text-muted-foreground",
};

/**
 * The cycle, and the phases within it.
 *
 * The phases were once separate cycles, so this listed them side by side as if a
 * year held several appraisals. They are phases of one cycle: the cycle is the
 * heading, its phases sit beneath, and the one running now is marked. A second
 * cycle (a past year) still gets its own block, so history stays reachable.
 */
export function CycleSwitcher({
  cycles,
  selectedId,
  phases,
}: {
  cycles: AppraisalCycle[];
  selectedId: string | null;
  /** Phases of the selected cycle, in order. Empty when it runs no workflow. */
  phases: CyclePhase[];
}) {
  if (cycles.length === 0) return null;
  const ordered = [...cycles].sort(
    (a, b) => b.year - a.year || b.period_start.localeCompare(a.period_start),
  );

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Appraisal cycle
      </p>
      <div className="space-y-3">
        {ordered.map((c) => {
          const selected = c.id === selectedId;
          const badge = STATUS_BADGE[c.status];
          return (
            <div key={c.id} className="space-y-1.5">
              <Link
                href={`/performance/appraisals?cycle=${c.id}`}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold transition",
                  selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c.name}
                {badge && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase",
                      badge.cls,
                    )}
                  >
                    {badge.label}
                  </span>
                )}
              </Link>

              {selected && phases.length > 0 && (
                <ol className="flex flex-wrap gap-2 pl-2">
                  {phases.map((p, i) => (
                    <li key={p.name}>
                      <div
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
                          PHASE_CLS[p.state],
                        )}
                        title={p.dueDate ? `Closes ${p.dueDate}` : undefined}
                      >
                        <span className="text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                        <span className="max-w-[16rem] truncate">{p.name}</span>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase",
                            PHASE_BADGE[p.state],
                          )}
                        >
                          {PHASE_STATE_LABEL[p.state]}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {selected && phases.length === 0 && (
                <p className="pl-2 text-xs text-muted-foreground">
                  This cycle runs no workflow, so it has no phases. Give it a template in
                  performance settings.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
