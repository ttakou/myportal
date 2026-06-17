"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { CopyPlus, ImagePlus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  MEAL_PERIOD_LABEL,
  type CanteenDish,
  type DishOptionGroup,
  type MealPeriod,
} from "@/types/canteen";
import type { Kitchen } from "@/lib/canteen";
import {
  addDish,
  addOption,
  addOptionGroup,
  copyMenu,
  deleteOption,
  deleteOptionGroup,
  setDishActive,
  setDishPhoto,
  updateDishDetails,
} from "../actions";

type Runner = (fn: () => Promise<{ ok: boolean; error?: string }>) => void;

export function MenuEditor({
  serviceDate,
  kitchens,
  dishes,
  mealPeriods,
}: {
  serviceDate: string;
  kitchens: Kitchen[];
  dishes: CanteenDish[];
  mealPeriods: MealPeriod[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  const [kitchenId, setKitchenId] = useState(kitchens[0]?.id ?? "");
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(mealPeriods[0] ?? "lunch");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("");
  const [copyTo, setCopyTo] = useState("");

  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    onOk?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!kitchenId) {
      setError("No kitchen available.");
      return;
    }
    run(
      () =>
        addDish({
          kitchenId,
          serviceDate,
          mealPeriod,
          name,
          description,
          capacity: capacity ? Number(capacity) : null,
        }),
      () => {
        setName("");
        setDescription("");
        setCapacity("");
      },
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <form
        onSubmit={submit}
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <select
          value={kitchenId}
          onChange={(e) => setKitchenId(e.target.value)}
          className="rounded-md border bg-background px-2 py-2 text-sm lg:col-span-1"
        >
          {kitchens.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
        <select
          value={mealPeriod}
          onChange={(e) => setMealPeriod(e.target.value as MealPeriod)}
          className="rounded-md border bg-background px-2 py-2 text-sm capitalize lg:col-span-1"
        >
          {mealPeriods.map((m) => (
            <option key={m} value={m}>
              {MEAL_PERIOD_LABEL[m]}
            </option>
          ))}
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dish name"
          required
          className="rounded-md border bg-background px-3 py-2 text-sm lg:col-span-2"
        />
        <input
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          placeholder="Capacity (optional)"
          type="number"
          min={0}
          className="rounded-md border bg-background px-3 py-2 text-sm lg:col-span-1"
        />
        <Button type="submit" disabled={pending} className="lg:col-span-1">
          <Plus className="h-4 w-4" /> Add
        </Button>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description (optional)"
          className="rounded-md border bg-background px-3 py-2 text-sm sm:col-span-2 lg:col-span-6"
        />
      </form>

      {/* Weekly / monthly planning: copy this day's menu to another date */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-4">
        <CopyPlus className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Copy this day&apos;s menu to:</span>
        <input
          value={copyTo}
          onChange={(e) => setCopyTo(e.target.value)}
          type="date"
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !copyTo}
          onClick={() => run(() => copyMenu(serviceDate, copyTo), () => setCopyTo(""))}
        >
          Copy
        </Button>
        <span className="text-xs text-muted-foreground">Plan a week/month by copying to each date.</span>
      </div>

      {mealPeriods.map((meal) => {
        const rows = dishes.filter((d) => d.meal_period === meal);
        if (rows.length === 0) return null;
        return (
          <section key={meal} className="space-y-2">
            <h2 className="text-lg font-semibold">{MEAL_PERIOD_LABEL[meal]}</h2>
            <div className="divide-y rounded-lg border">
              {rows.map((d) => (
                <div
                  key={d.id}
                  className={cn("px-4 py-3", !d.is_active && "opacity-60")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {d.name}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          · {d.kitchen_name}
                          {d.capacity != null && ` · cap ${d.capacity}`}
                        </span>
                      </p>
                      {d.description && (
                        <p className="text-sm text-muted-foreground">{d.description}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setDishActive(d.id, !d.is_active))}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        d.is_active
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {d.is_active ? "Published" : "Hidden"}
                    </button>
                  </div>
                  <DishDetails dish={d} run={run} pending={pending} />
                  <OptionsManager dish={d} run={run} pending={pending} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DishDetails({
  dish,
  run,
  pending,
}: {
  dish: CanteenDish;
  run: Runner;
  pending: boolean;
}) {
  const [uploading, setUploading] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${dish.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("meal-photos")
        .upload(path, file, { upsert: true });
      if (!error) {
        const { data } = supabase.storage.from("meal-photos").getPublicUrl(path);
        run(() => setDishPhoto(dish.id, data.publicUrl));
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="mt-3 grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-[auto_1fr]">
      {/* Photo */}
      <div className="flex flex-col items-start gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {dish.photo_url ? (
          <img src={dish.photo_url} alt={dish.name} className="h-20 w-28 rounded-md object-cover" />
        ) : (
          <div className="grid h-20 w-28 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">
            No photo
          </div>
        )}
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline">
          <ImagePlus className="h-3.5 w-3.5" />
          {uploading ? "Uploading…" : "Upload photo"}
          <input type="file" accept="image/*" className="hidden" disabled={uploading || pending} onChange={onFile} />
        </label>
      </div>

      {/* Fields */}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground sm:col-span-2">
          Ingredients
          <input
            defaultValue={dish.ingredients ?? ""}
            disabled={pending}
            placeholder="e.g. beef, palm oil, bitterleaf"
            onBlur={(e) => { if (e.target.value !== (dish.ingredients ?? "")) run(() => updateDishDetails({ dishId: dish.id, ingredients: e.target.value })); }}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground sm:col-span-2">
          Allergens (comma separated)
          <input
            defaultValue={dish.allergens.join(", ")}
            disabled={pending}
            placeholder="e.g. peanuts, shellfish, gluten"
            onBlur={(e) => { if (e.target.value !== dish.allergens.join(", ")) run(() => updateDishDetails({ dishId: dish.id, allergens: e.target.value })); }}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Quantity available
          <input
            type="number"
            min={0}
            defaultValue={dish.capacity ?? ""}
            disabled={pending}
            placeholder="unlimited"
            onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== dish.capacity) run(() => updateDishDetails({ dishId: dish.id, capacity: v })); }}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => updateDishDetails({ dishId: dish.id, available: !dish.available }))}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium",
              dish.available ? "bg-green-100 text-green-700" : "bg-destructive/10 text-destructive",
            )}
          >
            {dish.available ? "Available" : "Unavailable"}
          </button>
        </div>
        <label className="text-xs text-muted-foreground sm:col-span-2">
          Change note (shown to employees)
          <input
            defaultValue={dish.change_note ?? ""}
            disabled={pending}
            placeholder="e.g. Fish replaced with chicken today"
            onBlur={(e) => { if (e.target.value !== (dish.change_note ?? "")) run(() => updateDishDetails({ dishId: dish.id, changeNote: e.target.value })); }}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          />
        </label>
      </div>
    </div>
  );
}

function OptionsManager({
  dish,
  run,
  pending,
}: {
  dish: CanteenDish;
  run: Runner;
  pending: boolean;
}) {
  const [groupName, setGroupName] = useState("");
  const [minSel, setMinSel] = useState("1");
  const [maxSel, setMaxSel] = useState("1");

  return (
    <div className="mt-3 space-y-2 rounded-md bg-muted/40 p-3">
      {dish.option_groups.map((g) => (
        <OptionGroupRow key={g.id} group={g} run={run} pending={pending} />
      ))}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <input
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="New option group (e.g. Protein)"
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
        <label className="text-xs text-muted-foreground">
          min{" "}
          <input
            value={minSel}
            onChange={(e) => setMinSel(e.target.value)}
            type="number"
            min={0}
            className="w-12 rounded-md border bg-background px-1 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          max{" "}
          <input
            value={maxSel}
            onChange={(e) => setMaxSel(e.target.value)}
            type="number"
            min={1}
            className="w-12 rounded-md border bg-background px-1 py-1 text-sm"
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !groupName.trim()}
          onClick={() =>
            run(async () => {
              const res = await addOptionGroup({
                dishId: dish.id,
                name: groupName,
                minSelect: Number(minSel) || 0,
                maxSelect: Number(maxSel) || 1,
              });
              if (res.ok) setGroupName("");
              return res;
            })
          }
        >
          <Plus className="h-3.5 w-3.5" /> Group
        </Button>
      </div>
    </div>
  );
}

function OptionGroupRow({
  group,
  run,
  pending,
}: {
  group: DishOptionGroup;
  run: Runner;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const rule =
    group.max_select === 1
      ? "choose 1"
      : `choose ${group.min_select}–${group.max_select}`;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{group.name}</span>
      <span className="text-xs text-muted-foreground">({rule})</span>
      {group.options.length === 0 && (
        <span className="text-xs text-amber-600">⚠ add options →</span>
      )}
      {group.options.map((o) => (
        <span
          key={o.id}
          className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs"
        >
          {o.name}
          <button
            type="button"
            aria-label={`Remove ${o.name}`}
            disabled={pending}
            onClick={() => run(() => deleteOption(o.id))}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="add option"
        className="w-28 rounded-md border bg-background px-2 py-0.5 text-xs"
      />
      <Button
        size="sm"
        variant="ghost"
        disabled={pending || !name.trim()}
        onClick={() =>
          run(async () => {
            const res = await addOption(group.id, name);
            if (res.ok) setName("");
            return res;
          })
        }
      >
        Add
      </Button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => deleteOptionGroup(group.id))}
        className="text-xs text-muted-foreground hover:text-destructive"
      >
        delete group
      </button>
    </div>
  );
}
