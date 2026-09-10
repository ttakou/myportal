"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { COMMON_ALLERGENS, allergenKey, parseAllergens } from "@/lib/canteen/allergy";
import type { DietProfile } from "@/types/canteen";
import { setMyAllergens } from "../actions";

/**
 * The person's allergies: pick the common ones, add others by name. The
 * menu then flags any dish that lists one of them, and the kitchen's pack
 * list shows it next to the booking.
 */
export function DietPanel({ diet }: { diet: DietProfile }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [list, setList] = useState<string[]>(diet.allergens);
  const [other, setOther] = useState("");
  const [notes, setNotes] = useState(diet.notes ?? "");
  const keys = new Set(list.map(allergenKey));

  function toggle(name: string) {
    setSaved(false);
    const k = allergenKey(name);
    setList((cur) => (cur.some((a) => allergenKey(a) === k) ? cur.filter((a) => allergenKey(a) !== k) : [...cur, name]));
  }

  return (
    <details className="rounded-lg border bg-card p-4" open={diet.allergens.length === 0 ? undefined : false}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium">
        <ShieldAlert className="h-4 w-4 text-primary" /> My allergies
        {diet.allergens.length > 0 ? (
          <span className="text-xs font-normal text-muted-foreground">{diet.allergens.join(", ")}</span>
        ) : (
          <span className="text-xs font-normal text-muted-foreground">none on file — set them and the menu warns you</span>
        )}
      </summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const res = await setMyAllergens([...list, ...parseAllergens(other)].join(", "), notes);
            if (!res.ok) setError(res.error ?? "Could not save.");
            else {
              setList([...list, ...parseAllergens(other)]);
              setOther("");
              setSaved(true);
            }
          });
        }}
      >
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-1.5">
          {COMMON_ALLERGENS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => toggle(a)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                keys.has(allergenKey(a)) ? "border-destructive bg-destructive/10 text-destructive" : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {a}
            </button>
          ))}
          {list
            .filter((a) => !COMMON_ALLERGENS.some((c) => allergenKey(c) === allergenKey(a)))
            .map((a) => (
              <button key={a} type="button" onClick={() => toggle(a)} className="rounded-full border border-destructive bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                {a} ×
              </button>
            ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Other (comma-separated)" className="rounded-md border bg-background px-3 py-1.5 text-sm" />
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note for the kitchen (optional)" className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm" />
          <Button size="sm" type="submit" disabled={pending}>
            Save
          </Button>
          {saved && <span className="self-center text-xs text-muted-foreground">Saved</span>}
        </div>
      </form>
    </details>
  );
}
