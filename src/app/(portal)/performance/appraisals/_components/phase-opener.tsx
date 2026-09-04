"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { cn } from "@/lib/utils";
import { NO_PHASE_OPEN, PHASE_STATE_LABEL, type CyclePhase } from "@/lib/performance/cycle-phases";
import type { CycleChange } from "@/lib/performance/cycle-change";
import { ConfirmChange } from "./confirm-change";
import { setCyclePhase } from "../actions";

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
 * The phases of a cycle, and — for HR — the control that opens one.
 *
 * Which phase a cycle is on used to be inferred from the calendar, which is
 * wrong the moment the work runs behind its dates. Clicking a phase says where
 * the process actually is.
 */
export function PhaseRail({
  cycleId,
  phases,
  canOpen,
  isPinned = false,
  allClosed = false,
  participants = null,
  cycleName = null,
}: {
  cycleId: string;
  phases: CyclePhase[];
  /** HR and administrators decide which phase is open. */
  canOpen: boolean;
  /** True when a phase has been opened by hand rather than read off the dates. */
  isPinned?: boolean;
  /** True when every phase has been deliberately shut. */
  allClosed?: boolean;
  /** How many people the change reaches, for the confirmation to say so. */
  participants?: number | null;
  cycleName?: string | null;
}) {
  const [pending, startTransition] = useStatusTransition("Opening…");
  const [error, setError] = useState<string | null>(null);
  // A click proposes; the confirmation below disposes. Opening a phase moves
  // the whole cycle, and a misclick on this strip once re-opened goal setting
  // for the entire company.
  const [proposed, setProposed] = useState<CycleChange | null>(null);
  const openPhase = phases.find((p) => p.state === "current")?.name ?? null;

  function apply(change: CycleChange) {
    setError(null);
    const value =
      change.kind === "open_phase" ? change.phase
      : change.kind === "close_phase" ? NO_PHASE_OPEN
      : null;
    startTransition(async () => {
      const res = await setCyclePhase(cycleId, value);
      if (!res.ok) setError(res.error ?? "Couldn't change the phase.");
      else setProposed(null);
    });
  }

  return (
    <div className="space-y-1 pl-2">
      <ol className="flex flex-wrap gap-2">
        {phases.map((p, i) => {
          const body = (
            <>
              <span className="text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="max-w-[16rem] truncate">{p.name}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase",
                  PHASE_BADGE[p.state],
                )}
              >
                {p.state === "current" ? "Open" : PHASE_STATE_LABEL[p.state]}
              </span>
            </>
          );
          const cls = cn(
            "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
            PHASE_CLS[p.state],
          );
          const title = p.dueDate ? `Closes ${p.dueDate}` : undefined;
          return (
            <li key={p.name}>
              {canOpen && p.state !== "current" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setProposed({ kind: "open_phase", phase: p.name })}
                  title={`${title ? `${title}. ` : ""}Open this phase`}
                  className={cn(cls, "transition hover:bg-accent hover:text-foreground")}
                >
                  {body}
                </button>
              ) : (
                <div className={cls} title={title}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {canOpen && (
        <p className="text-[11px] text-muted-foreground">
          {allClosed
            ? "No phase is open. Click one to open it for everybody in the cycle."
            : "Click a phase to open it. Each person still works through their own appraisal in order — opening a phase says where the cycle is, it does not move anybody past their steps."}
          {!allClosed && phases.some((p) => p.state === "current") && (
            <>
              {" "}
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  setProposed({ kind: "close_phase", phase: openPhase ?? "the open phase" })
                }
                className="underline underline-offset-2 hover:text-foreground"
              >
                Close the open phase
              </button>
              {" ·"}
            </>
          )}
          {isPinned ? (
            <>
              {" "}
              <button
                type="button"
                disabled={pending}
                onClick={() => setProposed({ kind: "follow_dates" })}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Follow the dates instead
              </button>
            </>
          ) : (
            " The phase is currently read from the stage dates."
          )}
        </p>
      )}
      {proposed && (
        <ConfirmChange
          change={proposed}
          participants={participants}
          cycleName={cycleName}
          pending={pending}
          onConfirm={() => apply(proposed)}
          onCancel={() => {
            setProposed(null);
            setError(null);
          }}
        />
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
