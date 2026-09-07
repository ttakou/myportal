"use client";

import { useState } from "react";
import { AlertTriangle, BellRing, MoonStar, Pencil, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import type { TripMode } from "@/types/offshore";
import {
  describeNightlySwitch,
  NIGHTLY_RUN_HOUR_UTC,
  type NightlyMode,
} from "@/lib/offshore/schedule-settings";
import { setOffshoreDefaultMode, setOffshoreNightly } from "../actions";

/**
 * Module-level defaults for how crew changes are run.
 *
 * The first row is the mode: Automatic (one click from the rotation schedule)
 * or Manual (operator picks people/dates/cabins). The second is whether the
 * nightly job may take that click itself. Letting a job board and demobilise
 * crews with nobody watching is a step beyond one-click, so it is its own
 * switch, off by default, and turning it on asks for confirmation first —
 * the way a change to the appraisal cycle does. Offshore managers only.
 */
export function DefaultModeToggle({
  mode: initial,
  nightly: initialNightly,
}: {
  mode: TripMode;
  nightly: NightlyMode;
}) {
  const [mode, setMode] = useState<TripMode>(initial);
  const [nightly, setNightly] = useState<NightlyMode>(initialNightly);
  const [proposed, setProposed] = useState<NightlyMode | null>(null);
  const [pending, start] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function choose(next: TripMode) {
    if (next === mode || pending) return;
    const prev = mode;
    setMode(next);
    setError(null);
    start(async () => {
      const res = await setOffshoreDefaultMode(next);
      if (!res.ok) {
        setMode(prev); // revert on failure
        setError(res.error ?? "Could not save the default mode.");
      }
    });
  }

  function confirmNightly() {
    const next = proposed;
    if (!next || pending) return;
    setError(null);
    start(async () => {
      const res = await setOffshoreNightly(next);
      if (res.ok) {
        setNightly(next);
        setProposed(null);
      } else {
        setError(res.error ?? "Could not save the overnight setting.");
      }
    });
  }

  const acts = mode === "auto" && nightly === "act";
  const hour = `${String(NIGHTLY_RUN_HOUR_UTC).padStart(2, "0")}:00 UTC`;

  return (
    <section className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="mr-auto">
          <p className="text-sm font-medium">Default crew-change mode</p>
          <p className="text-xs text-muted-foreground">
            How new crew changes open: {mode === "auto" ? "one-click from the rotation schedule" : "pick people, dates & cabins by hand"}.
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-md border text-xs" role="group" aria-label="Default crew-change mode">
          <button
            type="button"
            onClick={() => choose("auto")}
            disabled={pending}
            aria-pressed={mode === "auto"}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 disabled:opacity-50",
              mode === "auto" ? "bg-primary font-medium text-primary-foreground" : "bg-background text-muted-foreground",
            )}
          >
            <Zap className="h-3.5 w-3.5" /> Automatic
          </button>
          <button
            type="button"
            onClick={() => choose("manual")}
            disabled={pending}
            aria-pressed={mode === "manual"}
            className={cn(
              "inline-flex items-center gap-1 border-l px-3 py-1.5 disabled:opacity-50",
              mode === "manual" ? "bg-primary font-medium text-primary-foreground" : "bg-background text-muted-foreground",
            )}
          >
            <Pencil className="h-3.5 w-3.5" /> Manual
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3">
        <div className="mr-auto">
          <p className="text-sm font-medium">Overnight, at {hour}</p>
          <p className="text-xs text-muted-foreground">
            {mode === "manual"
              ? "Manual mode: the schedule reminds people 3 days ahead and prompts the desk on the day; it never opens a crew change itself."
              : acts
                ? "The schedule boards each crew on its mobilise day and demobilises it at hitch end, and reminds people 3 days ahead."
                : "The schedule reminds people 3 days ahead and prompts the desk on the day; crew changes wait for a click here."}
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-md border text-xs" role="group" aria-label="Overnight schedule">
          <button
            type="button"
            onClick={() => setProposed(nightly === "prompt" ? null : "prompt")}
            disabled={pending || mode === "manual"}
            aria-pressed={nightly === "prompt"}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 disabled:opacity-50",
              nightly === "prompt" ? "bg-primary font-medium text-primary-foreground" : "bg-background text-muted-foreground",
            )}
          >
            <BellRing className="h-3.5 w-3.5" /> Prompt only
          </button>
          <button
            type="button"
            onClick={() => setProposed(nightly === "act" ? null : "act")}
            disabled={pending || mode === "manual"}
            aria-pressed={nightly === "act"}
            className={cn(
              "inline-flex items-center gap-1 border-l px-3 py-1.5 disabled:opacity-50",
              nightly === "act" ? "bg-primary font-medium text-primary-foreground" : "bg-background text-muted-foreground",
            )}
          >
            <MoonStar className="h-3.5 w-3.5" /> Act on the schedule
          </button>
        </div>
      </div>

      {proposed && proposed !== nightly && (
        <ConfirmNightly
          next={proposed}
          pending={pending}
          onConfirm={confirmNightly}
          onCancel={() => setProposed(null)}
        />
      )}
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </section>
  );
}

/** The step between clicking and letting a job move people. Nothing is saved until confirmed. */
function ConfirmNightly({
  next,
  pending,
  onConfirm,
  onCancel,
}: {
  next: NightlyMode;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const text = describeNightlySwitch(next);
  return (
    <div
      role="alertdialog"
      aria-labelledby="confirm-nightly-title"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p id="confirm-nightly-title" className="font-semibold">
            {text.title}
          </p>
          <p className="mt-0.5 text-xs">{text.consequence}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={pending} onClick={onConfirm}>
              {pending ? "Saving…" : text.confirmLabel}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
            <span className="text-xs">Nothing changes until you confirm.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
