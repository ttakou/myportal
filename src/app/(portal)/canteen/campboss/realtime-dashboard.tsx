"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Radio, Users, UtensilsCrossed } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  MEAL_PERIODS,
  MEAL_PERIOD_LABEL,
  type DishDemand,
  type MealPeriod,
  type OptionDemand,
} from "@/types/canteen";

export function RealtimeDashboard({
  serviceDate,
  initial,
  initialOptions,
}: {
  serviceDate: string;
  initial: DishDemand[];
  initialOptions: OptionDemand[];
}) {
  const [demand, setDemand] = useState<DishDemand[]>(initial);
  const [options, setOptions] = useState<OptionDemand[]>(initialOptions);
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const supabaseRef = useRef(createClient());

  const refetch = useCallback(async () => {
    const supabase = supabaseRef.current;
    const [d, o] = await Promise.all([
      supabase
        .from("canteen_dish_demand")
        .select("*")
        .eq("service_date", serviceDate)
        .order("meal_period")
        .order("kitchen_name"),
      supabase.from("canteen_option_demand").select("*").eq("service_date", serviceDate),
    ]);
    if (d.data) setDemand(d.data as DishDemand[]);
    if (o.data) setOptions(o.data as OptionDemand[]);
    setUpdatedAt(new Date());
  }, [serviceDate]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`canteen-demand-${serviceDate}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "canteen_bookings" },
        () => refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "canteen_booking_options" },
        () => refetch(),
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [serviceDate, refetch]);

  const optionsByDish = useMemo(() => {
    const map = new Map<string, OptionDemand[]>();
    for (const o of options) {
      const arr = map.get(o.dish_id) ?? [];
      arr.push(o);
      map.set(o.dish_id, arr);
    }
    return map;
  }, [options]);

  const grandTotal = demand.reduce((sum, d) => sum + Number(d.total_covers), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
        <div>
          <p className="text-sm text-muted-foreground">Total covers today</p>
          <p className="text-3xl font-semibold tabular-nums">{grandTotal}</p>
        </div>
        <div className="text-right">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              live
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Radio className={cn("h-3.5 w-3.5", live && "animate-pulse")} />
            {live ? "Live" : "Connecting…"}
          </span>
          {updatedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Updated {updatedAt.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {MEAL_PERIODS.map((meal) => {
        const rows = demand.filter((d) => d.meal_period === meal);
        if (rows.length === 0) return null;
        const mealTotal = rows.reduce((s, d) => s + Number(d.total_covers), 0);
        return (
          <section key={meal} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">
                {MEAL_PERIOD_LABEL[meal as MealPeriod]}
              </h2>
              <span className="text-sm text-muted-foreground">
                {mealTotal} covers
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((d) => (
                <DemandCard
                  key={d.dish_id}
                  d={d}
                  options={optionsByDish.get(d.dish_id) ?? []}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DemandCard({ d, options }: { d: DishDemand; options: OptionDemand[] }) {
  const total = Number(d.total_covers);
  const pct =
    d.capacity && d.capacity > 0
      ? Math.min(100, Math.round((total / d.capacity) * 100))
      : null;
  const over = d.capacity != null && total > d.capacity;

  // Group option counts by their group name (e.g. Protein, Sides).
  const groups = options.reduce<Record<string, OptionDemand[]>>((acc, o) => {
    (acc[o.group_name] ??= []).push(o);
    return acc;
  }, {});

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <UtensilsCrossed className="h-3.5 w-3.5" />
        {d.kitchen_name}
      </div>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{d.dish_name}</h3>
        <span className="text-2xl font-semibold tabular-nums">{total}</span>
      </div>
      <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Users className="h-3 w-3" />
        {d.headcount} staff
        {Number(d.guests) > 0 && <> · {d.guests} guests</>}
      </p>
      {pct != null && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p
            className={cn(
              "mt-1 text-xs",
              over ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {total} / {d.capacity} capacity{over && " · over capacity"}
          </p>
        </div>
      )}

      {Object.keys(groups).length > 0 && (
        <div className="mt-3 space-y-1.5 border-t pt-3">
          {Object.entries(groups).map(([groupName, opts]) => (
            <div key={groupName} className="text-xs">
              <span className="font-medium text-muted-foreground">{groupName}: </span>
              {opts
                .slice()
                .sort((a, b) => Number(b.picks) - Number(a.picks))
                .map((o, i) => (
                  <span key={o.option_id}>
                    {i > 0 && " · "}
                    {o.option_name}{" "}
                    <span className="font-semibold tabular-nums">{o.picks}</span>
                  </span>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
