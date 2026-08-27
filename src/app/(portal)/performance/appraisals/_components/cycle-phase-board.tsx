"use client";

import { useState } from "react";
import { CalendarRange, ChevronDown, Lock, LockOpen } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  NO_PHASE_OPEN,
  PHASE_STATE_LABEL,
  type CyclePhase,
} from "@/lib/performance/cycle-phases";
import { setCyclePhase } from "../actions";

export interface CyclePhaseInfo {
  phases: CyclePhase[];
  /** What the cycle's `current_phase` holds — drives "who decided this". */
  pinned: string | null;
  setByName: string | null;
  setAt: string | null;
}

const STATE_PILL: Record<CyclePhase["state"], string> = {
  current: "bg-green-100 text-green-700",
  done: "bg-muted text-muted-foreground",
  upcoming: "bg-muted text-muted-foreground",
};

/**
 * A cycle's phases: when each runs, where it stands, and the control that opens
 * or closes one for everybody.
 *
 * The cycle list said only "Active", which is true of the cycle and says
 * nothing about the process inside it — HR could not see that goal setting had
 * run over, or shut it once it had. Opening a phase moves all 120 participants
 * at once, so the panel says who last did it and when.
 */
export function CyclePhaseBoard({ cycleId, info }: { cycleId: string; info: CyclePhaseInfo }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  const allClosed = info.pinned === NO_PHASE_OPEN;
  const followsDates = info.pinned == null;

  function set(phase: string | null, failure: string) {
    setError(null);
    startTransition(async () => {
      const res = await setCyclePhase(cycleId, phase);
      if (!res.ok) setError(res.error ?? failure);
    });
  }

  return (
    <div className="space-y-2 border-t bg-muted/20 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" /> Phases
        </h4>
        <p className="text-[11px] text-muted-foreground">
          {followsDates
            ? "No phase has been opened by hand — the open one is read from the stage dates."
            : allClosed
              ? "Every phase is closed."
              : `${info.pinned} is open.`}
          {info.setByName && info.setAt && !followsDates
            ? ` Set by ${info.setByName} on ${info.setAt.slice(0, 10)}.`
            : ""}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-2 font-medium">Phase</th>
              <th className="py-1.5 pr-2 font-medium">Starts</th>
              <th className="py-1.5 pr-2 font-medium">Ends</th>
              <th className="py-1.5 pr-2 font-medium">Steps</th>
              <th className="py-1.5 pr-2 font-medium">Status</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {info.phases.map((p, i) => (
              <tr key={p.name} className={cn(p.state === "current" && "bg-green-50/60")}>
                <td className="py-1.5 pr-2">
                  <span className="mr-2 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className={cn(p.state === "current" && "font-medium")}>{p.name}</span>
                </td>
                <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">
                  {p.startDate ?? "—"}
                </td>
                <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">
                  {p.dueDate ?? "—"}
                </td>
                <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">{p.stageCount}</td>
                <td className="py-1.5 pr-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
                      STATE_PILL[p.state],
                    )}
                  >
                    {p.state === "current" ? "Open" : PHASE_STATE_LABEL[p.state]}
                  </span>
                </td>
                <td className="py-1.5 text-right">
                  {p.state === "current" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => set(NO_PHASE_OPEN, "Couldn't close that phase.")}
                      title={`Close ${p.name} for everybody`}
                    >
                      <Lock className="mr-1 h-3.5 w-3.5" /> Close
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => set(p.name, "Couldn't open that phase.")}
                      title={`Open ${p.name} for everybody`}
                    >
                      <LockOpen className="mr-1 h-3.5 w-3.5" /> Open
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {info.phases.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-xs text-muted-foreground">
                  This cycle runs no workflow template, so it has no phases. Give it one in
                  performance settings.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Opening a phase says where the cycle is for everybody in it. Each person still works
        through their own steps in order — it does not move anybody past theirs.
        {!followsDates && (
          <>
            {" "}
            <button
              type="button"
              disabled={pending}
              onClick={() => set(null, "Couldn't clear the open phase.")}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Follow the dates instead
            </button>
          </>
        )}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** The chevron that expands a cycle row into its phases. */
export function PhaseToggle({
  open,
  onClick,
  cycleName,
}: {
  open: boolean;
  onClick: () => void;
  cycleName: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} the phases of ${cycleName}`}
      className="inline-flex items-center gap-1.5 text-left font-medium hover:underline"
    >
      <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      {cycleName}
    </button>
  );
}
