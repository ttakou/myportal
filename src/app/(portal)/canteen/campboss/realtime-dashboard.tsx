"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { CheckCircle2, Circle, Minus, Plus, Radio, Users, UtensilsCrossed } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  MEAL_PERIOD_LABEL,
  type DishDemand,
  type MealPeriod,
  type OptionDemand,
  type Reservation,
} from "@/types/canteen";
import { setGuestCollected, setReservationCollected, setReservationPrepared } from "./actions";

export function RealtimeDashboard({
  serviceDate,
  initial,
  initialOptions,
  initialReservations,
  mealPeriods,
}: {
  serviceDate: string;
  initial: DishDemand[];
  initialOptions: OptionDemand[];
  initialReservations: Reservation[];
  mealPeriods: MealPeriod[];
}) {
  const [demand, setDemand] = useState<DishDemand[]>(initial);
  const [options, setOptions] = useState<OptionDemand[]>(initialOptions);
  const [reservations, setReservations] = useState<Reservation[]>(initialReservations);
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [pending, startTransition] = useTransition();
  const supabaseRef = useRef(createClient());

  const refetch = useCallback(async () => {
    const supabase = supabaseRef.current;
    const [d, o, r] = await Promise.all([
      supabase
        .from("canteen_dish_demand")
        .select("*")
        .eq("service_date", serviceDate)
        .order("meal_period")
        .order("kitchen_name"),
      supabase.from("canteen_option_demand").select("*").eq("service_date", serviceDate),
      supabase
        .from("canteen_reservations")
        .select("*")
        .eq("service_date", serviceDate)
        .order("created_at", { ascending: true }),
    ]);
    if (d.data) setDemand(d.data as DishDemand[]);
    if (o.data) setOptions(o.data as OptionDemand[]);
    if (r.data) setReservations(r.data as Reservation[]);
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

  function togglePacked(r: Reservation) {
    startTransition(async () => {
      await setReservationPrepared(r.booking_id, !r.prepared_at);
      refetch();
    });
  }

  function toggleCollected(r: Reservation) {
    startTransition(async () => {
      await setReservationCollected(r.booking_id, !r.collected_at);
      refetch();
    });
  }

  function collectGuest(r: Reservation, delta: 1 | -1) {
    startTransition(async () => {
      await setGuestCollected(r.booking_id, delta);
      refetch();
    });
  }

  const packedCount = reservations.filter((r) => r.prepared_at).length;

  // Actual service of the day, visitor plates included: each collected host
  // plate plus every visitor plate handed over (collected_guest_count). This is
  // what the canteen has truly served, vs the booked "total covers" demand.
  const servedToday = reservations.reduce(
    (s, r) => s + (r.collected_at ? 1 : 0) + Number(r.collected_guest_count ?? 0),
    0,
  );
  const visitorsServed = reservations.reduce(
    (s, r) => s + Number(r.collected_guest_count ?? 0),
    0,
  );

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
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <p className="text-sm text-muted-foreground">Booked covers today</p>
            <p className="text-3xl font-semibold tabular-nums">{grandTotal}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Served today</p>
            <p className="text-3xl font-semibold tabular-nums text-green-700">{servedToday}</p>
            <p className="text-xs text-muted-foreground">
              incl. {visitorsServed} visitor plate{visitorsServed === 1 ? "" : "s"}
            </p>
          </div>
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

      {mealPeriods.map((meal) => {
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

      {/* Per-person reservations — prepare packs in advance */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Reservations</h2>
          <span className="text-sm text-muted-foreground">
            {packedCount}/{reservations.length} packed
          </span>
        </div>

        {reservations.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No reservations yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Person</th>
                  <th className="px-4 py-3 font-medium">Kitchen</th>
                  <th className="px-4 py-3 font-medium">Dish &amp; choice</th>
                  <th className="px-4 py-3 font-medium">Pax</th>
                  <th className="px-4 py-3 font-medium text-right">Pack</th>
                  <th className="px-4 py-3 font-medium text-right">Collected</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reservations.map((r) => {
                  const packed = !!r.prepared_at;
                  const collected = !!r.collected_at;
                  return (
                    <tr key={r.booking_id} className={cn(collected ? "bg-green-50" : packed && "bg-primary/5")}>
                      <td className="px-4 py-3 font-medium">
                        {r.person_name || r.person_email}
                        {r.finalized_at ? (
                          <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">FINAL</span>
                        ) : (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">tentative</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.kitchen_name}</td>
                      <td className="px-4 py-3">
                        {r.dish_name}
                        {r.options && (
                          <span className="text-muted-foreground"> — {r.options}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <div>{1 + Number(r.guest_count)}</div>
                        {Number(r.guest_count) > 0 && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Users className="h-3 w-3" />
                            <button
                              type="button"
                              aria-label="Undo visitor plate"
                              disabled={pending || Number(r.collected_guest_count) <= 0}
                              onClick={() => collectGuest(r, -1)}
                              className="grid h-5 w-5 place-items-center rounded border disabled:opacity-40"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="tabular-nums font-medium">
                              {Number(r.collected_guest_count)}/{Number(r.guest_count)}
                            </span>
                            <button
                              type="button"
                              aria-label="Serve visitor plate"
                              disabled={pending || Number(r.collected_guest_count) >= Number(r.guest_count)}
                              onClick={() => collectGuest(r, 1)}
                              className="grid h-5 w-5 place-items-center rounded border disabled:opacity-40"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => togglePacked(r)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                            packed
                              ? "bg-primary/10 text-primary"
                              : "border text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {packed ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <Circle className="h-3.5 w-3.5" />
                          )}
                          {packed ? "Packed" : "Mark packed"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={pending || !packed}
                          onClick={() => toggleCollected(r)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium disabled:opacity-40",
                            collected
                              ? "bg-green-100 text-green-700"
                              : "border text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {collected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                          {collected ? "Collected" : "Mark collected"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
