"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StageDate } from "@/lib/performance/phase-dates";
import { phaseNameOf } from "@/lib/performance/cycle-phases";
import { setPhaseDeadlines } from "../../settings/cycle-template-actions";

const field = "rounded-md border bg-background px-2 py-1 text-sm";

/**
 * Set the phase deadlines by date.
 *
 * The workflow designer already let HR change these, but only as "days from
 * start" — setting goal setting to 31 March meant working out that it is day 89.
 * Here they type the date and the offset is computed on save.
 */
export function DeadlineEditor({
  cycleId,
  cycleName,
  cycleStart,
  initial,
}: {
  cycleId: string;
  cycleName: string;
  cycleStart: string;
  initial: StageDate[];
}) {
  const [open, setOpen] = useState(false);
  const [dates, setDates] = useState<Record<string, string>>(
    Object.fromEntries(initial.map((s) => [s.key, s.date])),
  );
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const changed = initial.some((s) => dates[s.key] !== s.date);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setPhaseDeadlines({ cycleId, dates });
      if (res.ok) setSaved(true);
      else setError(res.error ?? "Couldn't save the deadlines.");
    });
  }

  function reset() {
    setDates(Object.fromEntries(initial.map((s) => [s.key, s.date])));
    setError(null);
    setSaved(false);
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CalendarClock className="mr-1.5 h-4 w-4" /> Set phase deadlines
      </Button>
    );
  }

  // Group the steps under their phase, so the list reads as the process does.
  const groups: { phase: string; steps: StageDate[] }[] = [];
  for (const step of initial) {
    const phase = phaseNameOf(step.label);
    const last = groups[groups.length - 1];
    if (last && last.phase === phase) last.steps.push(step);
    else groups.push({ phase, steps: [step] });
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Phase deadlines — {cycleName}</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Dates are stored as days from the cycle&apos;s start ({cycleStart}), so the same process
        re-dates itself each year — which also means these become the standard for every cycle
        using this workflow, not just this one.
      </p>

      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.phase}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {g.phase}
            </p>
            <div className="mt-1 space-y-1">
              {g.steps.map((s) => (
                <label key={s.key} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-[15rem] flex-1">
                    {s.label.slice(phaseNameOf(s.label).length).replace(/^\s*[—–-]\s*/, "") ||
                      s.label}
                  </span>
                  <input
                    type="date"
                    value={dates[s.key] ?? ""}
                    disabled={pending}
                    onChange={(e) => {
                      setSaved(false);
                      setDates((d) => ({ ...d, [s.key]: e.target.value }));
                    }}
                    className={cn(field, dates[s.key] !== s.date && "border-primary")}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || !changed} onClick={save}>
          Save deadlines
        </Button>
        <Button size="sm" variant="outline" disabled={pending || !changed} onClick={reset}>
          Reset
        </Button>
        {saved && !changed && <span className="text-xs text-emerald-700">Saved.</span>}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
