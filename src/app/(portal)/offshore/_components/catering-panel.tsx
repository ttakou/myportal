"use client";

import { useEffect, useState, useTransition } from "react";
import { Download, Trash2, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Installation } from "@/types/offshore";
import { MEAL_LABEL, MEAL_TIME, type MealEntry, type MealKind } from "@/types/offshore";
import {
  addCasualMeal,
  fetchMealSheet,
  generateMealSheet,
  removeMealEntry,
  updateMealEntry,
} from "../actions";

const MEALS: MealKind[] = ["breakfast", "snack", "lunch", "dinner", "lodging"];
const field = "rounded-md border bg-background px-3 py-2 text-sm";

export function CateringPanel({ installations }: { installations: Installation[] }) {
  const [installationId, setInstallationId] = useState(installations[0]?.id ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [casual, setCasual] = useState("");

  function load() {
    if (!installationId || !date) return;
    startTransition(async () => {
      const res = await fetchMealSheet(installationId, date);
      if (res.ok) setEntries(res.entries ?? []);
    });
  }

  // Reload whenever installation/date change.
  useEffect(() => {
    if (!installationId || !date) return;
    let active = true;
    fetchMealSheet(installationId, date).then((res) => {
      if (active && res.ok) setEntries(res.entries ?? []);
    });
    return () => {
      active = false;
    };
  }, [installationId, date]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after = true) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else if (after) {
        const r = await fetchMealSheet(installationId, date);
        if (r.ok) setEntries(r.entries ?? []);
      }
    });
  }

  function toggle(e: MealEntry, meal: MealKind) {
    const next = !e[meal];
    setEntries((list) => list.map((x) => (x.id === e.id ? { ...x, [meal]: next } : x)));
    run(() => updateMealEntry({ id: e.id, [meal]: next }), false);
  }

  const totals = MEALS.reduce(
    (acc, m) => ({ ...acc, [m]: entries.filter((e) => e[m]).length }),
    {} as Record<MealKind, number>,
  );

  function exportCsv() {
    const head = ["No", "Name", "Category", ...MEALS.map((m) => MEAL_LABEL[m])];
    const body = entries.map((e, i) => [
      String(i + 1),
      e.person_name,
      e.category,
      ...MEALS.map((m) => (e[m] ? "1" : "")),
    ]);
    body.push(["", "TOTAL", "", ...MEALS.map((m) => String(totals[m]))]);
    const csv = [head, ...body]
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-meal-sheet-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <UtensilsCrossed className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Daily meal sheet</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Breakfast {MEAL_TIME.breakfast} · Snack {MEAL_TIME.snack} · Lunch {MEAL_TIME.lunch} · Dinner{" "}
        {MEAL_TIME.dinner}. Generated from POB; arrival day skips breakfast/snack and departure day
        skips lunch/dinner/lodging — untick anything a half-day visitor shouldn&apos;t get.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <select value={installationId} onChange={(e) => setInstallationId(e.target.value)} className={field}>
          <option value="">Installation…</option>
          {installations.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        <Button size="sm" disabled={pending || !installationId} onClick={() => run(() => generateMealSheet(installationId, date))}>
          Generate from POB
        </Button>
        {entries.length > 0 && (
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export
          </Button>
        )}
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Name</th>
              {MEALS.map((m) => (
                <th key={m} className="px-3 py-2 text-center font-medium">{MEAL_LABEL[m]}</th>
              ))}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map((e, i) => (
              <tr key={e.id} className={cn(e.category === "casual" && "bg-amber-50/50")}>
                <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-1.5">
                  {e.person_name}
                  {e.category !== "staff" && (
                    <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">{e.category}</span>
                  )}
                </td>
                {MEALS.map((m) => (
                  <td key={m} className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={e[m]}
                      disabled={pending}
                      onChange={() => toggle(e, m)}
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right">
                  <button
                    disabled={pending}
                    onClick={() => run(() => removeMealEntry(e.id))}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={MEALS.length + 3} className="px-3 py-6 text-center text-muted-foreground">
                  Pick an installation + date and Generate from POB.
                </td>
              </tr>
            )}
          </tbody>
          {entries.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-3 py-2" />
                <td className="px-3 py-2">TOTAL · {entries.length} POB</td>
                {MEALS.map((m) => (
                  <td key={m} className="px-3 py-2 text-center">{totals[m]}</td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {installationId && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            run(() => addCasualMeal({ installationId, date, personName: casual }), true);
            setCasual("");
          }}
        >
          <span className="text-sm text-muted-foreground">Add casual/visitor:</span>
          <input value={casual} onChange={(e) => setCasual(e.target.value)} placeholder="Name" className={field} />
          <Button size="sm" variant="outline" type="submit" disabled={pending || !casual.trim()}>
            Add
          </Button>
        </form>
      )}
    </div>
  );
}
