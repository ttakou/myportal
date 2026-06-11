"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, CheckCircle2, Minus, Plus, Users, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  MEAL_PERIOD_LABEL,
  type CanteenBooking,
  type CanteenDish,
  type DishOptionGroup,
  type MealPeriod,
} from "@/types/canteen";
import { bookDish, cancelBooking, finalizeBooking, updateGuests } from "../actions";

export function MenuBoard({
  dishes,
  bookings,
  mealPeriods,
}: {
  serviceDate: string;
  dishes: CanteenDish[];
  bookings: CanteenBooking[];
  mealPeriods: MealPeriod[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Per-dish option selection: dishId -> set of option ids.
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});

  const bookingByMeal = useMemo(() => {
    const map = new Map<MealPeriod, CanteenBooking>();
    for (const b of bookings) map.set(b.meal_period, b);
    return map;
  }, [bookings]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
    });
  }

  function toggleOption(dish: CanteenDish, group: DishOptionGroup, optionId: string) {
    setSelections((prev) => {
      const next = new Set(prev[dish.id] ?? []);
      const groupIds = group.options.map((o) => o.id);
      const selectedInGroup = groupIds.filter((id) => next.has(id));
      if (group.max_select === 1) {
        groupIds.forEach((id) => next.delete(id));
        if (!selectedInGroup.includes(optionId)) next.add(optionId);
      } else if (next.has(optionId)) {
        next.delete(optionId);
      } else if (selectedInGroup.length < group.max_select) {
        next.add(optionId);
      }
      return { ...prev, [dish.id]: next };
    });
  }

  function selectionValid(dish: CanteenDish): boolean {
    const sel = selections[dish.id] ?? new Set<string>();
    return dish.option_groups.every((g) => {
      if (g.options.length === 0) return true; // empty group imposes no rule
      const n = g.options.filter((o) => sel.has(o.id)).length;
      return n >= g.min_select && n <= g.max_select;
    });
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {mealPeriods.map((meal) => {
        const mealDishes = dishes.filter((d) => d.meal_period === meal);
        if (mealDishes.length === 0) return null;
        const booking = bookingByMeal.get(meal);
        const mealReady = !!booking?.prepared_at;
        const mealFinal = !!booking?.finalized_at;
        const mealLocked = mealReady || mealFinal;

        return (
          <section key={meal} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{MEAL_PERIOD_LABEL[meal]}</h2>
              {booking &&
                (mealReady ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    <CheckCircle2 className="h-3 w-3" /> Ready for collection
                  </span>
                ) : mealFinal ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    <CheckCircle2 className="h-3 w-3" /> Finalised
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                    <Check className="h-3 w-3" /> Selected (not final)
                  </span>
                ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mealDishes.map((dish) => {
                const isBooked = booking?.dish_id === dish.id;
                const sel = selections[dish.id] ?? new Set<string>();
                // Only groups that actually have options are selectable.
                const groups = dish.option_groups.filter((g) => g.options.length > 0);
                const hasOptions = groups.length > 0;
                return (
                  <div
                    key={dish.id}
                    className={cn(
                      "flex flex-col rounded-lg border p-4",
                      isBooked && mealLocked
                        ? "border-green-500 ring-2 ring-green-500"
                        : isBooked
                          ? "border-primary ring-1 ring-primary"
                          : "bg-card",
                    )}
                  >
                    {dish.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={dish.photo_url}
                        alt={dish.name}
                        className="mb-2 h-28 w-full rounded-md object-cover"
                      />
                    )}
                    <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <UtensilsCrossed className="h-3.5 w-3.5" />
                      {dish.kitchen_name}
                      {!dish.available && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
                          Unavailable
                        </span>
                      )}
                    </div>
                    <h3 className="font-medium">{dish.name}</h3>
                    {dish.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {dish.description}
                      </p>
                    )}
                    {dish.ingredients && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">Ingredients:</span> {dish.ingredients}
                      </p>
                    )}
                    {dish.allergens.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {dish.allergens.map((a) => (
                          <span key={a} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            ⚠ {a}
                          </span>
                        ))}
                      </p>
                    )}
                    {dish.change_note && (
                      <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                        {dish.change_note}
                      </p>
                    )}

                    {isBooked ? (
                      <div className="mt-3 space-y-2">
                        {booking!.selected_options.length > 0 && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">Your choice: </span>
                            {booking!.selected_options.map((o) => o.name).join(", ")}
                          </p>
                        )}
                        {mealReady ? (
                          <p className="inline-flex items-center gap-1.5 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                            <CheckCircle2 className="h-4 w-4" />
                            Ready for collection
                          </p>
                        ) : mealFinal ? (
                          <p className="inline-flex items-center gap-1.5 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                            <CheckCircle2 className="h-4 w-4" />
                            Finalised — choice locked
                          </p>
                        ) : (
                          <>
                            <GuestStepper
                              booking={booking!}
                              disabled={pending}
                              onChange={(n) => run(() => updateGuests(booking!.id, n))}
                            />
                            <Button
                              size="sm"
                              className="w-full"
                              disabled={pending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Finalise your choice? Once finalised you cannot change it.",
                                  )
                                ) {
                                  run(() => finalizeBooking(booking!.id));
                                }
                              }}
                            >
                              Finalise choice
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              disabled={pending}
                              onClick={() => run(() => cancelBooking(booking!.id))}
                            >
                              Cancel booking
                            </Button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-1 flex-col">
                        {hasOptions && (
                          <div className="mb-3 space-y-3">
                            {groups.map((g) => (
                              <fieldset key={g.id}>
                                <legend className="mb-1 text-xs font-medium text-muted-foreground">
                                  {g.name}
                                  <span className="ml-1 font-normal">
                                    {g.max_select === 1
                                      ? "(choose 1)"
                                      : g.min_select > 0
                                        ? `(choose ${g.min_select}–${g.max_select})`
                                        : `(up to ${g.max_select})`}
                                  </span>
                                </legend>
                                <div className="flex flex-wrap gap-1.5">
                                  {g.options.map((o) => {
                                    const active = sel.has(o.id);
                                    return (
                                      <button
                                        key={o.id}
                                        type="button"
                                        disabled={pending}
                                        onClick={() => toggleOption(dish, g, o.id)}
                                        className={cn(
                                          "rounded-full border px-3 py-1 text-sm transition-colors",
                                          active
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "hover:bg-accent",
                                        )}
                                      >
                                        {o.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </fieldset>
                            ))}
                          </div>
                        )}
                        <Button
                          size="sm"
                          className="mt-auto"
                          disabled={
                            pending ||
                            mealLocked ||
                            !dish.available ||
                            (hasOptions && !selectionValid(dish))
                          }
                          onClick={() =>
                            run(() =>
                              bookDish(dish.id, 0, [], Array.from(sel)),
                            )
                          }
                        >
                          {booking ? "Switch to this" : "Book"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function GuestStepper({
  booking,
  disabled,
  onChange,
}: {
  booking: CanteenBooking;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  const count = booking.guest_count;
  return (
    <div className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5 text-sm">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> Guests
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Remove guest"
          className="grid h-6 w-6 place-items-center rounded border disabled:opacity-40"
          disabled={disabled || count <= 0}
          onClick={() => onChange(count - 1)}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-4 text-center font-medium tabular-nums">{count}</span>
        <button
          type="button"
          aria-label="Add guest"
          className="grid h-6 w-6 place-items-center rounded border disabled:opacity-40"
          disabled={disabled || count >= 10}
          onClick={() => onChange(count + 1)}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
