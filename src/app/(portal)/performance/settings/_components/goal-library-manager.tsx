"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  GOAL_LEVELS,
  GOAL_LEVEL_LABEL,
  MEASUREMENT_TYPES,
  MEASUREMENT_TYPE_LABEL,
  type GoalLevel,
  type GoalTemplate,
  type MeasurementType,
} from "@/types/goal-template";
import { saveGoalTemplate, deleteGoalTemplate } from "../goal-template-actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

type Draft = {
  id?: string;
  title: string;
  description: string;
  category: string;
  level: GoalLevel;
  defaultWeight: number;
  measurementType: MeasurementType;
  unit: string;
  strategicObjective: string;
};

const emptyDraft = (): Draft => ({
  title: "",
  description: "",
  category: "",
  level: "individual",
  defaultWeight: 0,
  measurementType: "percentage",
  unit: "",
  strategicObjective: "",
});

const toDraft = (t: GoalTemplate): Draft => ({
  id: t.id,
  title: t.title,
  description: t.description ?? "",
  category: t.category ?? "",
  level: t.level,
  defaultWeight: t.defaultWeight,
  measurementType: t.measurementType,
  unit: t.unit ?? "",
  strategicObjective: t.strategicObjective ?? "",
});

export function GoalLibraryManager({ templates }: { templates: GoalTemplate[] }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  if (draft) {
    const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
    return (
      <div className="space-y-4">
        <div className="space-y-3 rounded-lg border bg-card p-5">
          <h2 className="font-medium">{draft.id ? "Edit goal" : "New library goal"}</h2>
          <label className="block text-xs text-muted-foreground">
            Title
            <input value={draft.title} onChange={(e) => set("title", e.target.value)} className={cn(field, "mt-0.5 block w-full py-1.5")} />
          </label>
          <label className="block text-xs text-muted-foreground">
            Description
            <input value={draft.description} onChange={(e) => set("description", e.target.value)} className={cn(field, "mt-0.5 block w-full py-1.5")} />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              Level
              <select value={draft.level} onChange={(e) => set("level", e.target.value as GoalLevel)} className={cn(field, "mt-0.5 block w-full py-1.5")}>
                {GOAL_LEVELS.map((l) => (
                  <option key={l} value={l}>{GOAL_LEVEL_LABEL[l]}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Measurement
              <select value={draft.measurementType} onChange={(e) => set("measurementType", e.target.value as MeasurementType)} className={cn(field, "mt-0.5 block w-full py-1.5")}>
                {MEASUREMENT_TYPES.map((m) => (
                  <option key={m} value={m}>{MEASUREMENT_TYPE_LABEL[m]}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Default weight %
              <input type="number" min={0} max={100} value={draft.defaultWeight} onChange={(e) => set("defaultWeight", Number(e.target.value))} className={cn(field, "mt-0.5 block w-full py-1.5")} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-muted-foreground">
              Category
              <input value={draft.category} onChange={(e) => set("category", e.target.value)} className={cn(field, "mt-0.5 block w-full py-1.5")} />
            </label>
            <label className="text-xs text-muted-foreground">
              Unit
              <input value={draft.unit} placeholder="e.g. %, USD, days" onChange={(e) => set("unit", e.target.value)} className={cn(field, "mt-0.5 block w-full py-1.5")} />
            </label>
            <label className="text-xs text-muted-foreground">
              Strategic objective
              <input value={draft.strategicObjective} onChange={(e) => set("strategicObjective", e.target.value)} className={cn(field, "mt-0.5 block w-full py-1.5")} />
            </label>
          </div>
        </div>

        {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => run(() => saveGoalTemplate(draft), () => setDraft(null))}>
            <Check className="h-4 w-4" /> Save goal
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => { setError(null); setDraft(null); }}>
            <X className="h-4 w-4" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={() => setDraft(emptyDraft())}>
          <Plus className="h-4 w-4" /> New goal
        </Button>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No library goals yet. Add corporate, department, team or individual goals employees can pick from.
        </p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{t.title}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{GOAL_LEVEL_LABEL[t.level]}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {MEASUREMENT_TYPE_LABEL[t.measurementType]}
                  {t.unit ? ` · ${t.unit}` : ""} · weight {t.defaultWeight}%
                  {t.category ? ` · ${t.category}` : ""}
                  {t.strategicObjective ? ` · ↳ ${t.strategicObjective}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setDraft(toDraft(t))}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => deleteGoalTemplate(t.id))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
