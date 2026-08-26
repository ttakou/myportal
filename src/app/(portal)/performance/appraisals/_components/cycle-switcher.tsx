import Link from "next/link";
import type { CyclePhase } from "@/lib/performance/cycle-phases";
import type { AppraisalCycle } from "@/types/appraisal";
import { cn } from "@/lib/utils";
import { PhaseRail } from "./phase-opener";

const STATUS_BADGE: Record<AppraisalCycle["status"], { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-green-100 text-green-700" },
  draft: { label: "Draft", cls: "bg-amber-100 text-amber-700" },
  closed: { label: "Closed", cls: "bg-muted text-muted-foreground" },
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
  canOpenPhase = false,
  pinnedPhase = null,
}: {
  cycles: AppraisalCycle[];
  selectedId: string | null;
  /** Phases of the selected cycle, in order. Empty when it runs no workflow. */
  phases: CyclePhase[];
  /** HR and administrators may open a phase. */
  canOpenPhase?: boolean;
  /** The phase opened by hand, if any — as opposed to one read off the dates. */
  pinnedPhase?: string | null;
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
                <PhaseRail
                  cycleId={c.id}
                  phases={phases}
                  canOpen={canOpenPhase}
                  isPinned={Boolean(pinnedPhase)}
                />
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
