"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Check, X, LayoutDashboard, CalendarClock, Play } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ACCESS_ROLES,
  ACCESS_ROLE_LABEL,
  CHART_TYPES,
  CHART_TYPE_LABEL,
  DIMENSIONS,
  DIMENSION_LABEL,
  MEASURES,
  MEASURE_LABEL,
  type AccessRole,
  type ChartType,
  type Dimension,
  type Measure,
  type ReportDefinition,
  type ReportFilter,
} from "@/types/reporting";
import { saveReportDefinition, deleteReportDefinition } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

const emptyReport = (): ReportDefinition => ({
  id: `new-${Math.random().toString(36).slice(2, 8)}`,
  name: "",
  description: null,
  dimensions: [],
  measures: [],
  filters: [],
  chartType: "table",
  schedule: null,
  isWidget: false,
  roleAccess: ["hr"],
});

export function ReportBuilder({ reports }: { reports: ReportDefinition[] }) {
  const [draft, setDraft] = useState<ReportDefinition | null>(null);
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else after?.();
    });
  }

  if (draft) {
    return (
      <ReportEditor
        draft={draft}
        setDraft={setDraft}
        pending={pending}
        error={error}
        onCancel={() => {
          setError(null);
          setDraft(null);
        }}
        onSave={() => run(() => saveReportDefinition(draft), () => setDraft(null))}
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={() => setDraft(emptyReport())}>
          <Plus className="h-4 w-4" /> New report
        </Button>
      </div>

      {reports.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No reports yet. Build one from dimensions and measures.
        </p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{r.name}</h3>
                  {r.isWidget && <LayoutDashboard className="h-4 w-4 text-muted-foreground" />}
                  {r.schedule && <CalendarClock className="h-4 w-4 text-muted-foreground" />}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.measures.map((m) => MEASURE_LABEL[m]).join(", ") || "no measures"}
                  {r.dimensions.length ? ` · by ${r.dimensions.map((d) => DIMENSION_LABEL[d]).join(", ")}` : ""}
                  {" · "}
                  {CHART_TYPE_LABEL[r.chartType]}
                </p>
              </div>
              <div className="flex gap-1">
                <Link href={`/performance/reports/${r.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <Play className="h-4 w-4" /> Run
                </Link>
                <Button variant="outline" size="sm" onClick={() => setDraft(r)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => deleteReportDefinition(r.id))}>
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

function ReportEditor({
  draft,
  setDraft,
  pending,
  error,
  onCancel,
  onSave,
}: {
  draft: ReportDefinition;
  setDraft: (r: ReportDefinition) => void;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof ReportDefinition>(k: K, v: ReportDefinition[K]) => setDraft({ ...draft, [k]: v });
  const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const setFilter = (i: number, patch: Partial<ReportFilter>) =>
    set("filters", draft.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Name
            <input value={draft.name} onChange={(e) => set("name", e.target.value)} className={cn(field, "mt-0.5 block w-full py-1.5")} />
          </label>
          <label className="text-xs text-muted-foreground">
            Chart type
            <select value={draft.chartType} onChange={(e) => set("chartType", e.target.value as ChartType)} className={cn(field, "mt-0.5 block w-full py-1.5")}>
              {CHART_TYPES.map((c) => (
                <option key={c} value={c}>{CHART_TYPE_LABEL[c]}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs text-muted-foreground">
          Description
          <input value={draft.description ?? ""} onChange={(e) => set("description", e.target.value || null)} className={cn(field, "mt-0.5 block w-full py-1.5")} />
        </label>
      </div>

      <Chips title="Measures" options={MEASURES} selected={draft.measures} labelOf={(m: Measure) => MEASURE_LABEL[m]} onToggle={(v) => set("measures", toggle(draft.measures, v))} />
      <Chips title="Dimensions (group by)" options={DIMENSIONS} selected={draft.dimensions} labelOf={(d: Dimension) => DIMENSION_LABEL[d]} onToggle={(v) => set("dimensions", toggle(draft.dimensions, v))} />

      <section className="space-y-2 rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Filters</h3>
          <Button variant="outline" size="sm" onClick={() => set("filters", [...draft.filters, { dimension: "department", value: "" }])}>
            <Plus className="h-4 w-4" /> Add filter
          </Button>
        </div>
        {draft.filters.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <select value={f.dimension} onChange={(e) => setFilter(i, { dimension: e.target.value as Dimension })} className={cn(field, "py-1.5")}>
              {DIMENSIONS.map((d) => (
                <option key={d} value={d}>{DIMENSION_LABEL[d]}</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">=</span>
            <input value={f.value} onChange={(e) => setFilter(i, { value: e.target.value })} placeholder="value" className={cn(field, "flex-1 py-1.5")} />
            <Button variant="ghost" size="sm" onClick={() => set("filters", draft.filters.filter((_, j) => j !== i))} aria-label="Remove filter">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </section>

      <Chips title="Who can view (role-based access)" options={ACCESS_ROLES} selected={draft.roleAccess} labelOf={(r: AccessRole) => ACCESS_ROLE_LABEL[r]} onToggle={(v) => set("roleAccess", toggle(draft.roleAccess, v))} />

      <section className="space-y-3 rounded-lg border bg-card p-5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.isWidget} onChange={(e) => set("isWidget", e.target.checked)} className="h-4 w-4" />
          Pin as a dashboard widget
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!draft.schedule}
            onChange={(e) => set("schedule", e.target.checked ? { frequency: "monthly", recipients: [] } : null)}
            className="h-4 w-4"
          />
          Schedule delivery
        </label>
        {draft.schedule && (
          <div className="flex flex-wrap items-end gap-2 pl-6">
            <label className="text-xs text-muted-foreground">
              Frequency
              <select
                value={draft.schedule.frequency}
                onChange={(e) => set("schedule", { ...draft.schedule!, frequency: e.target.value as "weekly" | "monthly" | "quarterly" })}
                className={cn(field, "mt-0.5 block py-1.5")}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </label>
            <label className="flex-1 text-xs text-muted-foreground">
              Recipients (comma-separated emails)
              <input
                value={draft.schedule.recipients.join(", ")}
                onChange={(e) => set("schedule", { ...draft.schedule!, recipients: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
                className={cn(field, "mt-0.5 block w-full py-1.5")}
              />
            </label>
          </div>
        )}
      </section>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={pending}>
          <Check className="h-4 w-4" /> Save report
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          <X className="h-4 w-4" /> Cancel
        </Button>
      </div>
    </div>
  );
}

function Chips<T extends string>({
  title,
  options,
  selected,
  labelOf,
  onToggle,
}: {
  title: string;
  options: T[];
  selected: T[];
  labelOf: (v: T) => string;
  onToggle: (v: T) => void;
}) {
  return (
    <section className="space-y-2 rounded-lg border bg-card p-5">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              selected.includes(o) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {labelOf(o)}
          </button>
        ))}
      </div>
    </section>
  );
}
