"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  MEAL_PERIODS,
  MEAL_PERIOD_LABEL,
  type MealPeriod,
} from "@/types/canteen";
import { setCanteenMealPeriods } from "../actions";

export function CanteenSettingsPanel({
  served,
}: {
  served: MealPeriod[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState<Set<MealPeriod>>(new Set(served));

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
    </section>
  );
}
