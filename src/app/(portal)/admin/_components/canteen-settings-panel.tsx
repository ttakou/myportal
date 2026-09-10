"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  MEAL_PERIODS,
  MEAL_PERIOD_LABEL,
  type MealPeriod,
} from "@/types/canteen";
import { setCanteenCutoff, setCanteenExtras, setCanteenMealPeriods } from "../actions";

const numField = "mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-sm text-foreground";

export function CanteenSettingsPanel({
  served,
  cutoffHour,
  extras,
}: {
  served: MealPeriod[];
  cutoffHour: number | null;
  extras: { costPerMeal: number; subsidyPerMeal: number; remindBeforeCutoffMinutes: number; menuOutHour: number; noShowWarningThreshold: number };
}) {
  const [cost, setCost] = useState(String(extras.costPerMeal));
  const [subsidy, setSubsidy] = useState(String(extras.subsidyPerMeal));
  const [remind, setRemind] = useState(String(extras.remindBeforeCutoffMinutes));
  const [menuOut, setMenuOut] = useState(String(extras.menuOutHour));
  const [threshold, setThreshold] = useState(String(extras.noShowWarningThreshold));
  const [extrasSaved, setExtrasSaved] = useState(false);
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState<Set<MealPeriod>>(new Set(served));
  const [cutoff, setCutoff] = useState(cutoffHour == null ? "" : String(cutoffHour));

  function toggle(m: MealPeriod) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setCanteenMealPeriods(Array.from(selected));
      if (!res.ok) setError(res.error ?? "Failed to save.");
      else setSaved(true);
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Canteen</h2>
        <p className="text-sm text-muted-foreground">
          Which meals the canteen serves and accepts bookings for.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-4">
        {MEAL_PERIODS.map((m) => {
          const active = selected.has(m);
          return (
            <button
              key={m}
              type="button"
              role="switch"
              aria-checked={active}
              disabled={pending}
              onClick={() => toggle(m)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {MEAL_PERIOD_LABEL[m]}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-3">
          {saved && <span className="text-sm text-muted-foreground">Saved</span>}
          <Button size="sm" onClick={save} disabled={pending || selected.size === 0}>
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-4">
        <span className="text-sm font-medium">Same-day booking cut-off:</span>
        <select
          value={cutoff}
          onChange={(e) => setCutoff(e.target.value)}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">No cut-off</option>
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>{`${h}:00`}</option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await setCanteenCutoff(cutoff === "" ? null : Number(cutoff));
              if (!res.ok) setError(res.error ?? "Failed to save.");
            })
          }
        >
          Save cut-off
        </Button>
        <span className="text-xs text-muted-foreground">
          After this hour (site time), employees can&apos;t book today&apos;s lunch.
        </span>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">Costs and nudges</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-muted-foreground">
            Cost per meal
            <input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className={`${numField}`} />
          </label>
          <label className="text-xs text-muted-foreground">
            Company subsidy per meal
            <input type="number" min={0} step="0.01" value={subsidy} onChange={(e) => setSubsidy(e.target.value)} className={`${numField}`} />
          </label>
          <label className="text-xs text-muted-foreground">
            Remind unbooked people before cutoff (min, 0 off)
            <input type="number" min={0} max={240} value={remind} onChange={(e) => setRemind(e.target.value)} className={`${numField}`} />
          </label>
          <label className="text-xs text-muted-foreground">
            Announce tomorrow&apos;s menu at (hour, -1 off)
            <input type="number" min={-1} max={23} value={menuOut} onChange={(e) => setMenuOut(e.target.value)} className={`${numField}`} />
          </label>
          <label className="text-xs text-muted-foreground">
            Warn after N missed meals in 30 days (0 off)
            <input type="number" min={0} max={30} value={threshold} onChange={(e) => setThreshold(e.target.value)} className={`${numField}`} />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                setExtrasSaved(false);
                const res = await setCanteenExtras({
                  costPerMeal: Number(cost),
                  subsidyPerMeal: Number(subsidy),
                  remindBeforeCutoffMinutes: Number(remind),
                  menuOutHour: Number(menuOut),
                  noShowWarningThreshold: Number(threshold),
                });
                if (!res.ok) setError(res.error ?? "Failed to save.");
                else setExtrasSaved(true);
              })
            }
          >
            Save costs and nudges
          </Button>
          {extrasSaved && <span className="text-sm text-muted-foreground">Saved</span>}
          <span className="text-xs text-muted-foreground">Costs feed the canteen reports; nudges are sent by the canteen job every 15 minutes.</span>
        </div>
      </div>
    </section>
  );
}
