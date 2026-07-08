"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Rocket, Check, X, GitBranch, LayoutList, Upload } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CYCLE_TYPES,
  CYCLE_TYPE_LABEL,
  DEFAULT_VISIBILITY,
  type CyclePopulation,
  type CycleTemplate,
  type CycleType,
  type CycleVisibility,
} from "@/types/cycle-template";
import { CONFIG_STATUS_LABEL } from "@/types/versioning";
import {
  saveCycleTemplate,
  deleteCycleTemplate,
  createCycleFromTemplate,
  publishCycleTemplate,
  newCycleTemplateVersion,
} from "../cycle-template-actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
type ScaleOpt = { id: string; name: string };

type Draft = {
  id?: string;
  name: string;
  description: string;
  cycleType: CycleType;
  ratingScaleId: string | null;
  weightOkr: number;
  weightCompetency: number;
  weightDevelopment: number;
  requireSecondLevel: boolean;
  reminderDaysBefore: number;
  population: CyclePopulation;
  visibility: CycleVisibility;
  effectiveFrom: string;
  effectiveTo: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  cycleType: "annual",
  ratingScaleId: null,
  weightOkr: 60,
  weightCompetency: 30,
  weightDevelopment: 10,
  requireSecondLevel: false,
  reminderDaysBefore: 7,
  population: { type: "all" },
  visibility: { ...DEFAULT_VISIBILITY },
  effectiveFrom: "",
  effectiveTo: "",
});

const toDraft = (t: CycleTemplate): Draft => ({
  id: t.id,
  name: t.name,
  description: t.description ?? "",
  cycleType: t.cycleType,
  ratingScaleId: t.ratingScaleId,
  weightOkr: t.weightOkr,
  weightCompetency: t.weightCompetency,
  weightDevelopment: t.weightDevelopment,
  requireSecondLevel: t.requireSecondLevel,
  reminderDaysBefore: t.reminderDaysBefore,
  population: t.population,
  visibility: t.visibility,
  effectiveFrom: t.effectiveFrom ?? "",
  effectiveTo: t.effectiveTo ?? "",
});

export function CycleTemplatesManager({
  templates,
  scales,
}: {
  templates: CycleTemplate[];
  scales: ScaleOpt[];
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [launching, setLaunching] = useState<CycleTemplate | null>(null);
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
      <TemplateEditor
        draft={draft}
        setDraft={setDraft}
        scales={scales}
        pending={pending}
        error={error}
        onCancel={() => {
          setError(null);
          setDraft(null);
        }}
        onSave={() => run(() => saveCycleTemplate(draft), () => setDraft(null))}
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
          <Plus className="h-4 w-4" /> New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No cycle templates yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {templates.map((t) => {
            const scale = scales.find((s) => s.id === t.ratingScaleId);
            return (
              <li key={t.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{t.name}</h3>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {CYCLE_TYPE_LABEL[t.cycleType]}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          t.status === "published"
                            ? "bg-green-100 text-green-700"
                            : t.status === "draft"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {CONFIG_STATUS_LABEL[t.status]} · v{t.version}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Weights {t.weightOkr}/{t.weightCompetency}/{t.weightDevelopment} ·{" "}
                      {scale ? scale.name : "no scale"} ·{" "}
                      {t.requireSecondLevel ? "2nd-level approval" : "single approval"} · reminds{" "}
                      {t.reminderDaysBefore}d before ·{" "}
                      {t.population.type === "all" ? "all staff" : t.population.type}
                      {t.effectiveFrom || t.effectiveTo
                        ? ` · effective ${t.effectiveFrom ?? "…"}–${t.effectiveTo ?? "…"}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Link
                      href={`/performance/settings/cycle-templates/${t.id}/workflow`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <GitBranch className="h-4 w-4" /> Workflow
                    </Link>
                    <Link
                      href={`/performance/settings/cycle-templates/${t.id}/form`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <LayoutList className="h-4 w-4" /> Form
                    </Link>
                    {t.status === "draft" && (
                      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => publishCycleTemplate(t.id))}>
                        <Upload className="h-4 w-4" /> Publish
                      </Button>
                    )}
                    <Button variant="outline" size="sm" disabled={pending} title="Start a new draft version" onClick={() => run(() => newCycleTemplateVersion(t.id))}>
                      <GitBranch className="h-4 w-4" /> New version
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setLaunching(t)}>
                      <Rocket className="h-4 w-4" /> Launch
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDraft(toDraft(t))}>
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => deleteCycleTemplate(t.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {launching?.id === t.id && (
                  <LaunchForm
                    template={t}
                    pending={pending}
                    onCancel={() => setLaunching(null)}
                    onLaunch={(payload) =>
                      run(
                        () => createCycleFromTemplate({ templateId: t.id, ...payload }),
                        () => setLaunching(null),
                      )
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LaunchForm({
  template,
  pending,
  onCancel,
  onLaunch,
}: {
  template: CycleTemplate;
  pending: boolean;
  onCancel: () => void;
  onLaunch: (p: {
    name: string;
    year: number;
    periodStart: string;
    periodEnd: string;
    goalSettingDeadline?: string;
  }) => void;
}) {
  const year = new Date().getFullYear();
  const [name, setName] = useState(`${year} ${template.name}`);
  const [periodStart, setStart] = useState(`${year}-01-01`);
  const [periodEnd, setEnd] = useState(`${year}-12-31`);
  const [deadline, setDeadline] = useState("");

  return (
    <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground">Launch a {year} cycle from this template</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cycle name" className={cn(field, "py-1.5")} />
        <input type="date" value={periodStart} onChange={(e) => setStart(e.target.value)} className={cn(field, "py-1.5")} aria-label="Period start" />
        <input type="date" value={periodEnd} onChange={(e) => setEnd(e.target.value)} className={cn(field, "py-1.5")} aria-label="Period end" />
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={cn(field, "py-1.5")} aria-label="Goal-setting deadline" />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            onLaunch({
              name,
              year,
              periodStart,
              periodEnd,
              goalSettingDeadline: deadline || undefined,
            })
          }
        >
          <Rocket className="h-4 w-4" /> Launch cycle
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function TemplateEditor({
  draft,
  setDraft,
  scales,
  pending,
  error,
  onCancel,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  scales: ScaleOpt[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });
  const setVis = (k: keyof CycleVisibility, v: boolean) =>
    setDraft({ ...draft, visibility: { ...draft.visibility, [k]: v } });
  const total = draft.weightOkr + draft.weightCompetency + draft.weightDevelopment;

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="font-medium">{draft.id ? "Edit template" : "New template"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Name
            <input value={draft.name} onChange={(e) => set("name", e.target.value)} className={cn(field, "mt-0.5 block w-full py-1.5")} />
          </label>
          <label className="text-xs text-muted-foreground">
            Type
            <select value={draft.cycleType} onChange={(e) => set("cycleType", e.target.value as CycleType)} className={cn(field, "mt-0.5 block w-full py-1.5")}>
              {CYCLE_TYPES.map((k) => (
                <option key={k} value={k}>{CYCLE_TYPE_LABEL[k]}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs text-muted-foreground">
          Description
          <input value={draft.description} onChange={(e) => set("description", e.target.value)} className={cn(field, "mt-0.5 block w-full py-1.5")} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Effective from
            <input type="date" value={draft.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} className={cn(field, "mt-0.5 block w-full py-1.5")} />
          </label>
          <label className="text-xs text-muted-foreground">
            Effective to
            <input type="date" value={draft.effectiveTo} onChange={(e) => set("effectiveTo", e.target.value)} className={cn(field, "mt-0.5 block w-full py-1.5")} />
          </label>
        </div>
        <label className="block text-xs text-muted-foreground sm:w-1/2">
          Rating scale
          <select
            value={draft.ratingScaleId ?? ""}
            onChange={(e) => set("ratingScaleId", e.target.value || null)}
            className={cn(field, "mt-0.5 block w-full py-1.5")}
          >
            <option value="">— none —</option>
            {scales.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-5">
        <h3 className="font-medium">Scoring &amp; approvals</h3>
        <div className="flex flex-wrap items-end gap-4">
          <WeightInput label="Objectives %" value={draft.weightOkr} onChange={(v) => set("weightOkr", v)} />
          <WeightInput label="Competencies %" value={draft.weightCompetency} onChange={(v) => set("weightCompetency", v)} />
          <WeightInput label="Development %" value={draft.weightDevelopment} onChange={(v) => set("weightDevelopment", v)} />
          <span className="text-xs">
            Total <span className={cn("font-semibold", total === 100 ? "text-green-700" : "text-destructive")}>{total}%</span>
          </span>
          <label className="text-xs text-muted-foreground">
            Reminder (days before)
            <input type="number" min={0} max={90} value={draft.reminderDaysBefore} onChange={(e) => set("reminderDaysBefore", Number(e.target.value))} className={cn(field, "mt-0.5 block w-24 py-1")} />
          </label>
        </div>
        <Toggle label="Require second-level manager approval" checked={draft.requireSecondLevel} onChange={(v) => set("requireSecondLevel", v)} />
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-5">
        <h3 className="font-medium">Eligible population &amp; visibility</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">
            Population
            <select
              value={draft.population.type}
              onChange={(e) => set("population", { ...draft.population, type: e.target.value as CyclePopulation["type"] })}
              className={cn(field, "mt-0.5 block py-1.5")}
            >
              <option value="all">All active staff</option>
              <option value="department">By department</option>
              <option value="grade">By grade</option>
            </select>
          </label>
          {draft.population.type === "department" && (
            <label className="flex-1 text-xs text-muted-foreground">
              Departments (comma-separated)
              <input
                value={(draft.population.departments ?? []).join(", ")}
                onChange={(e) => set("population", { ...draft.population, departments: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
                className={cn(field, "mt-0.5 block w-full py-1.5")}
              />
            </label>
          )}
          {draft.population.type === "grade" && (
            <label className="flex-1 text-xs text-muted-foreground">
              Grades (comma-separated)
              <input
                value={(draft.population.grades ?? []).join(", ")}
                onChange={(e) => set("population", { ...draft.population, grades: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
                className={cn(field, "mt-0.5 block w-full py-1.5")}
              />
            </label>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Toggle label="Employee sees manager rating" checked={draft.visibility.employeeSeesManagerRating} onChange={(v) => setVis("employeeSeesManagerRating", v)} />
          <Toggle label="Employee sees final score" checked={draft.visibility.employeeSeesScore} onChange={(v) => setVis("employeeSeesScore", v)} />
          <Toggle label="Blind review (hide self-rating until manager submits)" checked={!draft.visibility.managerSeesSelfBeforeRating} onChange={(v) => setVis("managerSeesSelfBeforeRating", !v)} />
        </div>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={pending}>
          <Check className="h-4 w-4" /> Save template
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          <X className="h-4 w-4" /> Cancel
        </Button>
      </div>
    </div>
  );
}

function WeightInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <input type="number" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className={cn(field, "mt-0.5 block w-24 py-1")} />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border bg-background p-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}
