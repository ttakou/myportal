"use client";

import { useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Check } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STAGE_ROLES, STAGE_ROLE_LABEL, type StageRole } from "@/types/workflow";
import {
  SECTION_TYPES,
  SECTION_TYPE_LABEL,
  defaultSection,
  type FormSection,
  type SectionType,
} from "@/types/form-section";
import { updateTemplateForm } from "../cycle-template-actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

export function FormBuilder({
  templateId,
  initial,
}: {
  templateId: string;
  initial: FormSection[];
}) {
  const [sections, setSections] = useState<FormSection[]>(initial);
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [addType, setAddType] = useState<SectionType>("individual_objectives");

  const mutate = (next: FormSection[]) => {
    setSaved(false);
    setSections(next);
  };
  const setSec = (i: number, patch: Partial<FormSection>) =>
    mutate(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = sections.slice();
    [next[i], next[j]] = [next[j], next[i]];
    mutate(next);
  };
  const remove = (i: number) => mutate(sections.filter((_, j) => j !== i));
  const toggleRole = (i: number, kind: "visibleRoles" | "editableRoles", r: StageRole) => {
    const cur = sections[i][kind];
    setSec(i, { [kind]: cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r] } as Partial<FormSection>);
  };

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateTemplateForm(templateId, sections);
      if (!res.ok) setError(res.error ?? "Couldn't save form.");
      else setSaved(true);
    });
  }

  const totalWeight = sections.reduce((sum, s) => sum + (s.weight || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={addType} onChange={(e) => setAddType(e.target.value as SectionType)} className={cn(field, "py-1.5")}>
          {SECTION_TYPES.map((t) => (
            <option key={t} value={t}>{SECTION_TYPE_LABEL[t]}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => mutate([...sections, defaultSection(addType)])}>
          <Plus className="h-4 w-4" /> Add section
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          Total weight: <span className="font-semibold">{totalWeight}%</span>
        </span>
      </div>

      {sections.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No sections yet. Add sections to build the appraisal form.
        </p>
      ) : (
        <ol className="space-y-3">
          {sections.map((s, i) => (
            <li key={i} className="rounded-lg border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {i + 1}
                </span>
                <div className="flex-1 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="text-xs text-muted-foreground sm:col-span-2">
                      Title
                      <input value={s.title} onChange={(e) => setSec(i, { title: e.target.value })} className={cn(field, "mt-0.5 block w-full py-1")} />
                    </label>
                    <div className="text-xs text-muted-foreground">
                      Type
                      <div className={cn(field, "mt-0.5 truncate py-1 text-foreground")}>{SECTION_TYPE_LABEL[s.type]}</div>
                    </div>
                  </div>
                  <label className="block text-xs text-muted-foreground">
                    Instructions
                    <input value={s.instructions ?? ""} onChange={(e) => setSec(i, { instructions: e.target.value || null })} className={cn(field, "mt-0.5 block w-full py-1")} />
                  </label>

                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs text-muted-foreground">
                      Weight %
                      <input type="number" min={0} max={100} value={s.weight} onChange={(e) => setSec(i, { weight: Number(e.target.value) })} className={cn(field, "mt-0.5 block w-20 py-1")} />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Max score
                      <input type="number" value={s.maxScore ?? ""} onChange={(e) => setSec(i, { maxScore: e.target.value === "" ? null : Number(e.target.value) })} className={cn(field, "mt-0.5 block w-24 py-1")} />
                    </label>
                    <label className="flex-1 text-xs text-muted-foreground">
                      Condition (show when)
                      <input value={s.condition ?? ""} placeholder="e.g. promotion:ready" onChange={(e) => setSec(i, { condition: e.target.value || null })} className={cn(field, "mt-0.5 block w-full py-1")} />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <RolePicker label="Visible to" roles={s.visibleRoles} onToggle={(r) => toggleRole(i, "visibleRoles", r)} />
                    <RolePicker label="Editable by" roles={s.editableRoles} onToggle={(r) => toggleRole(i, "editableRoles", r)} />
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                    <Chk label="Mandatory" checked={s.mandatory} onChange={(v) => setSec(i, { mandatory: v })} />
                    <Chk label="Evidence required" checked={s.evidenceRequired} onChange={(v) => setSec(i, { evidenceRequired: v })} />
                    <Chk label="Attachments" checked={s.allowAttachments} onChange={(v) => setSec(i, { allowAttachments: v })} />
                    <Chk label="Comments" checked={s.allowComments} onChange={(v) => setSec(i, { allowComments: v })} />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" disabled={i === sections.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
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
          <Check className="h-4 w-4" /> Save form
        </Button>
        {saved && !pending && <span className="text-sm text-green-700">Saved</span>}
      </div>
    </div>
  );
}

function RolePicker({
  label,
  roles,
  onToggle,
}: {
  label: string;
  roles: StageRole[];
  onToggle: (r: StageRole) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {STAGE_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onToggle(r)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              roles.includes(r) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {STAGE_ROLE_LABEL[r]}
          </button>
        ))}
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
