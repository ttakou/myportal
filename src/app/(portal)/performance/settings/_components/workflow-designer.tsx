"use client";

import { useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Check } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  STAGE_FIELDS,
  STAGE_FIELD_LABEL,
  STAGE_PRESETS,
  STAGE_ROLES,
  STAGE_ROLE_LABEL,
  type StageField,
  type StageRole,
  type WorkflowStage,
} from "@/types/workflow";
import { updateTemplateWorkflow } from "../cycle-template-actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

const blankStage = (): WorkflowStage => ({
  key: `stage_${Math.random().toString(36).slice(2, 8)}`,
  label: "New stage",
  responsibleRole: "employee",
  dueOffsetDays: 0,
  mandatory: true,
  editableFields: [],
  allowApprove: false,
  allowReject: false,
  allowReturn: false,
  autoProgress: false,
  parallelGroup: null,
  condition: null,
  notify: true,
});

export function WorkflowDesigner({
  templateId,
  initial,
}: {
  templateId: string;
  initial: WorkflowStage[];
}) {
  const [stages, setStages] = useState<WorkflowStage[]>(initial);
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [presetKey, setPresetKey] = useState("");

  const mutate = (next: WorkflowStage[]) => {
    setSaved(false);
    setStages(next);
  };
  const setStage = (i: number, patch: Partial<WorkflowStage>) =>
    mutate(stages.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const next = stages.slice();
    [next[i], next[j]] = [next[j], next[i]];
    mutate(next);
  };
  const remove = (i: number) => mutate(stages.filter((_, j) => j !== i));
  const addPreset = () => {
    const p = STAGE_PRESETS.find((s) => s.key === presetKey);
    if (p) mutate([...stages, { ...p, key: `${p.key}_${stages.length}` }]);
  };
  const toggleField = (i: number, f: StageField) => {
    const cur = stages[i].editableFields;
    setStage(i, { editableFields: cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f] });
  };

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateTemplateWorkflow(templateId, stages);
      if (!res.ok) setError(res.error ?? "Couldn't save workflow.");
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={presetKey} onChange={(e) => setPresetKey(e.target.value)} className={cn(field, "py-1.5")}>
          <option value="">Add a standard stage…</option>
          {STAGE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" disabled={!presetKey} onClick={addPreset}>
          <Plus className="h-4 w-4" /> Add
        </Button>
        <Button variant="outline" size="sm" onClick={() => mutate([...stages, blankStage()])}>
          <Plus className="h-4 w-4" /> Blank stage
        </Button>
      </div>

      {stages.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No stages yet. Add standard stages or build your own sequence.
        </p>
      ) : (
        <ol className="space-y-3">
          {stages.map((s, i) => (
            <li key={i} className="rounded-lg border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {i + 1}
                </span>
                <div className="flex-1 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="text-xs text-muted-foreground sm:col-span-2">
                      Stage name
                      <input value={s.label} onChange={(e) => setStage(i, { label: e.target.value })} className={cn(field, "mt-0.5 block w-full py-1")} />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Responsible
                      <select value={s.responsibleRole} onChange={(e) => setStage(i, { responsibleRole: e.target.value as StageRole })} className={cn(field, "mt-0.5 block w-full py-1")}>
                        {STAGE_ROLES.map((r) => (
                          <option key={r} value={r}>{STAGE_ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs text-muted-foreground">
                      Due (days from start)
                      <input type="number" value={s.dueOffsetDays} onChange={(e) => setStage(i, { dueOffsetDays: Number(e.target.value) })} className={cn(field, "mt-0.5 block w-28 py-1")} />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Parallel group
                      <input value={s.parallelGroup ?? ""} placeholder="(none)" onChange={(e) => setStage(i, { parallelGroup: e.target.value || null })} className={cn(field, "mt-0.5 block w-28 py-1")} />
                    </label>
                    <label className="flex-1 text-xs text-muted-foreground">
                      Condition
                      <input value={s.condition ?? ""} placeholder="e.g. grade:management" onChange={(e) => setStage(i, { condition: e.target.value || null })} className={cn(field, "mt-0.5 block w-full py-1")} />
                    </label>
                  </div>

                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Editable fields</p>
                    <div className="flex flex-wrap gap-1.5">
                      {STAGE_FIELDS.map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => toggleField(i, f)}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs",
                            s.editableFields.includes(f)
                              ? "border-primary bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {STAGE_FIELD_LABEL[f]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                    <Chk label="Mandatory" checked={s.mandatory} onChange={(v) => setStage(i, { mandatory: v })} />
                    <Chk label="Approve" checked={s.allowApprove} onChange={(v) => setStage(i, { allowApprove: v })} />
                    <Chk label="Reject" checked={s.allowReject} onChange={(v) => setStage(i, { allowReject: v })} />
                    <Chk label="Return for correction" checked={s.allowReturn} onChange={(v) => setStage(i, { allowReturn: v })} />
                    <Chk label="Auto-progress" checked={s.autoProgress} onChange={(v) => setStage(i, { autoProgress: v })} />
                    <Chk label="Notify" checked={s.notify} onChange={(v) => setStage(i, { notify: v })} />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" disabled={i === stages.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(i)} aria-label="Remove">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          <Check className="h-4 w-4" /> Save workflow
        </Button>
        {saved && !pending && <span className="text-sm text-green-700">Saved</span>}
      </div>
    </div>
  );
}

function Chk({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}
