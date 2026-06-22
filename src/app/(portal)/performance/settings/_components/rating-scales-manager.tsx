"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Star, X, Check } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  RATING_SCALE_KINDS,
  RATING_SCALE_KIND_LABEL,
  scaleBounds,
  type RatingScale,
  type RatingScaleKind,
  type RatingScaleLevel,
} from "@/types/rating-scale";
import { deleteRatingScale, saveRatingScale, setDefaultScale } from "../scale-actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

type Draft = {
  id?: string;
  name: string;
  description: string;
  kind: RatingScaleKind;
  levels: RatingScaleLevel[];
  allowDecimals: boolean;
  commentRequired: boolean;
  evidenceRequired: boolean;
  showNumericToEmployee: boolean;
};

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  kind: "performance",
  levels: [
    { value: 3, label: "Meets expectations", color: "#0891b2" },
    { value: 2, label: "Needs improvement", color: "#d97706" },
    { value: 1, label: "Unsatisfactory", color: "#dc2626" },
  ],
  allowDecimals: false,
  commentRequired: false,
  evidenceRequired: false,
  showNumericToEmployee: true,
});

const toDraft = (s: RatingScale): Draft => ({
  id: s.id,
  name: s.name,
  description: s.description ?? "",
  kind: s.kind,
  levels: s.levels.length ? s.levels : emptyDraft().levels,
  allowDecimals: s.allowDecimals,
  commentRequired: s.commentRequired,
  evidenceRequired: s.evidenceRequired,
  showNumericToEmployee: s.showNumericToEmployee,
});

export function RatingScalesManager({ scales }: { scales: RatingScale[] }) {
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
    return (
      <ScaleEditor
        draft={draft}
        setDraft={setDraft}
        pending={pending}
        error={error}
        onCancel={() => {
          setError(null);
          setDraft(null);
        }}
        onSave={() =>
          run(() => saveRatingScale(draft), () => setDraft(null))
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-end">
        <Button onClick={() => setDraft(emptyDraft())}>
          <Plus className="h-4 w-4" /> New scale
        </Button>
      </div>

      {scales.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No rating scales yet. Create one to use across appraisal cycles.
        </p>
      ) : (
        <ul className="space-y-3">
          {scales.map((s) => {
            const b = scaleBounds(s.levels);
            return (
              <li key={s.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{s.name}</h3>
                      {s.isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <Star className="h-3 w-3" /> Default
                        </span>
                      )}
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {RATING_SCALE_KIND_LABEL[s.kind]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {s.levels.length} levels · {b.min}–{b.max}
                      {s.allowDecimals ? " · decimals" : ""}
                      {s.commentRequired ? " · comment required" : ""}
                      {s.evidenceRequired ? " · evidence required" : ""}
                      {s.showNumericToEmployee ? "" : " · numeric hidden from employee"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {!s.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => setDefaultScale(s.id, s.kind))}
                      >
                        <Star className="h-4 w-4" /> Make default
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setDraft(toDraft(s))}>
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending || s.isDefault}
                      title={s.isDefault ? "Set another scale as default first" : "Delete"}
                      onClick={() => run(() => deleteRatingScale(s.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.levels.map((l, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: l.color ?? "#94a3b8" }}
                      />
                      <span className="font-medium">{l.value}</span> {l.label}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ScaleEditor({
  draft,
  setDraft,
  pending,
  error,
  onCancel,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft({ ...draft, [key]: value });

  const setLevel = (i: number, patch: Partial<RatingScaleLevel>) =>
    setDraft({ ...draft, levels: draft.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const addLevel = () => {
    const nextVal = (draft.levels.reduce((m, l) => Math.max(m, l.value), 0) || 0) + 1;
    setDraft({ ...draft, levels: [{ value: nextVal, label: "", color: "#0891b2" }, ...draft.levels] });
  };

  const removeLevel = (i: number) =>
    setDraft({ ...draft, levels: draft.levels.filter((_, j) => j !== i) });

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="font-medium">{draft.id ? "Edit scale" : "New scale"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Name
            <input
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Standard 5-point"
              className={cn(field, "mt-0.5 block w-full py-1.5")}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Kind
            <select
              value={draft.kind}
              onChange={(e) => set("kind", e.target.value as RatingScaleKind)}
              className={cn(field, "mt-0.5 block w-full py-1.5")}
            >
              {RATING_SCALE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {RATING_SCALE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs text-muted-foreground">
          Description
          <input
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            className={cn(field, "mt-0.5 block w-full py-1.5")}
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Check2 label="Allow decimals" checked={draft.allowDecimals} onChange={(v) => set("allowDecimals", v)} />
          <Check2 label="Comment mandatory" checked={draft.commentRequired} onChange={(v) => set("commentRequired", v)} />
          <Check2 label="Evidence required" checked={draft.evidenceRequired} onChange={(v) => set("evidenceRequired", v)} />
          <Check2
            label="Employee can see numeric value"
            checked={draft.showNumericToEmployee}
            onChange={(v) => set("showNumericToEmployee", v)}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Levels</h3>
          <Button variant="outline" size="sm" onClick={addLevel}>
            <Plus className="h-4 w-4" /> Add level
          </Button>
        </div>
        <div className="space-y-2">
          {draft.levels.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                step="any"
                value={l.value}
                onChange={(e) => setLevel(i, { value: Number(e.target.value) })}
                className={cn(field, "w-20 py-1")}
                aria-label="Value"
              />
              <input
                value={l.label}
                onChange={(e) => setLevel(i, { label: e.target.value })}
                placeholder="Label"
                className={cn(field, "min-w-[10rem] flex-1 py-1")}
                aria-label="Label"
              />
              <input
                type="color"
                value={l.color ?? "#0891b2"}
                onChange={(e) => setLevel(i, { color: e.target.value })}
                className="h-8 w-10 rounded border"
                aria-label="Colour"
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={draft.levels.length <= 2}
                onClick={() => removeLevel(i)}
                aria-label="Remove level"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={pending}>
          <Check className="h-4 w-4" /> Save scale
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Check2({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border bg-background p-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}
