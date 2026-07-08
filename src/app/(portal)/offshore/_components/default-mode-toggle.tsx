"use client";

import { useState } from "react";
import { Pencil, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStatusTransition } from "@/components/activity";
import type { TripMode } from "@/types/offshore";
import { setOffshoreDefaultMode } from "../actions";

/**
 * Module-level default for how crew changes are run: Automatic (one click from
 * the rotation schedule) or Manual (operator picks people/dates/cabins). Applies
 * to every new crew-change prompt for the tenant. Offshore managers only.
 */
export function DefaultModeToggle({ mode: initial }: { mode: TripMode }) {
  const [mode, setMode] = useState<TripMode>(initial);
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

  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card p-3">
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
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </section>
  );
}
