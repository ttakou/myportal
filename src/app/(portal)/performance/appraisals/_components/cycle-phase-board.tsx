"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarRange, ChevronDown, Lock, LockOpen } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  NO_PHASE_OPEN,
  PHASE_STATE_LABEL,
  type CyclePhase,
} from "@/lib/performance/cycle-phases";
import type { CycleChange } from "@/lib/performance/cycle-change";
import { cycleChangeDone } from "@/lib/performance/cycle-change";
import { ConfirmChange } from "./confirm-change";
import { setCyclePhase } from "../actions";
import { setPhaseBoundary } from "../../settings/cycle-template-actions";

export interface CyclePhaseInfo {
  phases: CyclePhase[];
  /** What the cycle's `current_phase` holds — drives "who decided this". */
  pinned: string | null;
  setByName: string | null;
  setAt: string | null;
  /** How many people a change reaches, for the confirmation to say so. */
  participants?: number | null;
  cycleName?: string | null;
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
  const [note, setNote] = useState<string | null>(null);

  const allClosed = info.pinned === NO_PHASE_OPEN;
  const followsDates = info.pinned == null;

  // Every change to the process goes through one confirmation. A proposal
  // carries what to do once confirmed; the board writes nothing until then.
  const [proposed, setProposed] = useState<
    | { change: CycleChange; run: () => Promise<{ ok: boolean; error?: string; note?: string }> }
    | null
  >(null);

  function propose(change: CycleChange, run: () => Promise<{ ok: boolean; error?: string; note?: string }>) {
    setError(null);
    setNote(null);
    setProposed({ change, run });
  }

  function confirmProposed() {
    if (!proposed) return;
    const { change, run } = proposed;
    startTransition(async () => {
      const res = await run();
      if (!res.ok) {
        setError(res.error ?? "Couldn't make that change.");
        return;
      }
      setProposed(null);
      setNote(res.note ?? cycleChangeDone(change));
    });
  }

  function setPhase(phase: string | null) {
    return async () => {
      const res = await setCyclePhase(cycleId, phase);
      return res.ok ? { ok: true } : { ok: false, error: res.error };
    };
  }

  /**
   * Save one boundary. A phase dragging its neighbours along is worth saying
   * out loud, so the count of other steps that moved comes back with it.
   */
  function saveBoundary(stageKey: string, date: string) {
    return async () => {
      const res = await setPhaseBoundary({ cycleId, stageKey, date });
      if (!res.ok) return { ok: false, error: res.error ?? "Couldn't save that date." };
      const others = (res.moved ?? []).filter((m) => m.key !== stageKey);
      return {
        ok: true,
        note:
          others.length === 0
            ? "Saved."
            : `Saved — ${others.length} other step${others.length === 1 ? "" : "s"} moved to keep the order: ${others
                .map((m) => m.label)
                .join(", ")}.`,
      };
    };
  }

  /**
   * A date typed over: proposed, not saved, until confirmed. `shown` is the
   * date as typed; `date` is what the step actually receives, which for the
   * start column is a day earlier.
   */
  function proposeBoundary(
    label: string,
    from: string | null,
    stageKey: string,
    date: string,
    shown: string,
  ) {
    propose({ kind: "move_boundary", label, from, to: shown }, saveBoundary(stageKey, date));
  }

  return (
    <div className="space-y-2 border-t bg-muted/20 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" /> Phases
          {/* The board moves phase boundaries; the deadlines page is still
              where the steps inside a phase are dated one by one. */}
          <Link
            href="/performance/deadlines"
            className="font-normal normal-case tracking-normal text-primary underline underline-offset-2 hover:no-underline"
          >
            All step deadlines
          </Link>
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
                <td className="py-1.5 pr-2">
                  {/* A phase starts the day after the one before it ended, so
                      editing this moves that phase's last step — the same
                      value the row above shows as its end. The first phase
                      starts with the cycle, which is not ours to move. */}
                  {i === 0 ? (
                    <span
                      className="tabular-nums text-muted-foreground"
                      title="The first phase starts with the cycle."
                    >
                      {p.startDate ?? "—"}
                    </span>
                  ) : (
                    <DateCell
                      key={`start-${p.startDate}-${proposed ? "p" : ""}`}
                      value={p.startDate}
                      stageKey={lastStageKey(info.phases[i - 1])}
                      shiftDays={-1}
                      onSave={(key, date, shown) =>
                        proposeBoundary(`Start of ${p.name}`, p.startDate, key, date, shown)
                      }
                      busy={pending}
                      label={`Start of ${p.name}`}
                    />
                  )}
                </td>
                <td className="py-1.5 pr-2">
                  <DateCell
                    key={`end-${p.dueDate}-${proposed ? "p" : ""}`}
                    value={p.dueDate}
                    stageKey={lastStageKey(p)}
                    onSave={(key, date, shown) =>
                      proposeBoundary(`End of ${p.name}`, p.dueDate, key, date, shown)
                    }
                    busy={pending}
                    label={`End of ${p.name}`}
                  />
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
                      onClick={() =>
                        propose({ kind: "close_phase", phase: p.name }, setPhase(NO_PHASE_OPEN))
                      }
                      title={`Close ${p.name} for everybody`}
                    >
                      <Lock className="mr-1 h-3.5 w-3.5" /> Close
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => propose({ kind: "open_phase", phase: p.name }, setPhase(p.name))}
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
        Type over a date to move a phase; it saves when you leave the field. A phase ends on the
        deadline of its last step and starts the day after the one before it closed, so the two
        columns are the same boundary seen from either side — and the steps around it shift only
        as far as the order requires. To date each step separately, use{" "}
        <Link href="/performance/deadlines" className="underline underline-offset-2 hover:text-foreground">
          Deadlines
        </Link>
        .
      </p>
      <p className="text-[11px] text-muted-foreground">
        Opening a phase says where the cycle is for everybody in it. Each person still works
        through their own steps in order — it does not move anybody past theirs.
        {!followsDates && (
          <>
            {" "}
            <button
              type="button"
              disabled={pending}
              onClick={() => propose({ kind: "follow_dates" }, setPhase(null))}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Follow the dates instead
            </button>
          </>
        )}
      </p>
      {proposed && (
        <ConfirmChange
          change={proposed.change}
          participants={info.participants ?? null}
          cycleName={info.cycleName ?? null}
          pending={pending}
          onConfirm={confirmProposed}
          onCancel={() => {
            setProposed(null);
            setError(null);
          }}
        />
      )}
      {note && <p className="text-xs text-emerald-700">{note}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** The step a phase ends on — the one a boundary edit actually moves. */
function lastStageKey(phase: CyclePhase | undefined): string | null {
  return phase?.stageKeys[phase.stageKeys.length - 1] ?? null;
}

const DAY_MS = 86_400_000;

/** Shift an ISO date by whole days, in UTC. */
function shiftIso(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * One date on the board, editable where it sits.
 *
 * Saves on blur rather than on every keystroke — a date input fires change on
 * each part typed, and a half-entered year would drag the rest of the process
 * with it. `shiftDays` is for the start column: the value shown is the day
 * after the step being moved, so it goes back a day on the way in.
 */
function DateCell({
  value,
  stageKey,
  shiftDays = 0,
  onSave,
  busy,
  label,
}: {
  value: string | null;
  stageKey: string | null;
  shiftDays?: number;
  /** (stage to move, date the step receives, date as typed) */
  onSave: (stageKey: string, date: string, shown: string) => void;
  busy: boolean;
  label: string;
}) {
  // Keyed on `value` by the caller, so a saved date replaces the draft rather
  // than the field holding what was typed over a figure the server has moved.
  const [draft, setDraft] = useState(value ?? "");

  if (!stageKey || value === null) {
    return <span className="tabular-nums text-muted-foreground">{value ?? "—"}</span>;
  }

  return (
    <input
      type="date"
      aria-label={label}
      title={`${label} — the deadline of the step it turns on`}
      value={draft || value}
      disabled={busy}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft || value;
        if (!next || next === value) {
          setDraft(value);
          return;
        }
        onSave(stageKey, shiftIso(next, shiftDays), next);
      }}
      className={cn(
        "w-[9.5rem] rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm tabular-nums",
        "hover:border-input focus:border-input focus:bg-background",
        (draft || value) !== value && "border-primary",
      )}
    />
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
