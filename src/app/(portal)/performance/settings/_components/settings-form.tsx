"use client";

import { useState } from "react";
import { Check, Save } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PerformanceConfig } from "@/types/performance-config";
import { updatePerformanceConfig } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border bg-card p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-medium">{title}</h2>
        {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

export function PerformanceSettingsForm({ config }: { config: PerformanceConfig }) {
  const [c, setC] = useState<PerformanceConfig>(config);
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof PerformanceConfig>(key: K, value: PerformanceConfig[K]) => {
    setSaved(false);
    setC((cur) => ({ ...cur, [key]: value }));
  };

  const weightTotal = c.weightOkr + c.weightCompetency + c.weightDevelopment;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updatePerformanceConfig(c);
      if (!res.ok) setError(res.error ?? "Couldn't save settings.");
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-5">
      <Section
        title="Goals"
        desc="How many objectives each employee may set, and the quality rules they must meet."
      >
        <div className="flex flex-wrap gap-4">
          <label className="text-xs text-muted-foreground">
            Minimum goals
            <input
              type="number"
              min={0}
              max={50}
              value={c.minGoals}
              onChange={(e) => set("minGoals", Number(e.target.value))}
              className={cn(field, "mt-0.5 block w-24 py-1")}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Maximum goals
            <input
              type="number"
              min={1}
              max={50}
              value={c.maxGoals}
              onChange={(e) => set("maxGoals", Number(e.target.value))}
              className={cn(field, "mt-0.5 block w-24 py-1")}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Min goal weight %
            <input
              type="number"
              min={0}
              max={100}
              value={c.minGoalWeight}
              onChange={(e) => set("minGoalWeight", Number(e.target.value))}
              className={cn(field, "mt-0.5 block w-24 py-1")}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Max goal weight %
            <input
              type="number"
              min={0}
              max={100}
              value={c.maxGoalWeight}
              onChange={(e) => set("maxGoalWeight", Number(e.target.value))}
              className={cn(field, "mt-0.5 block w-24 py-1")}
            />
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Toggle
            label="Weights must total 100%"
            checked={c.goalWeightsTotal100}
            onChange={(v) => set("goalWeightsTotal100", v)}
          />
          <Toggle
            label="Require a success indicator"
            checked={c.requireSuccessIndicator}
            onChange={(v) => set("requireSuccessIndicator", v)}
          />
          <Toggle
            label="Require alignment to an objective"
            checked={c.requireAlignment}
            onChange={(v) => set("requireAlignment", v)}
          />
          <Toggle
            label="Employees can modify approved goals"
            checked={c.allowModifyApproved}
            onChange={(v) => set("allowModifyApproved", v)}
          />
          <Toggle
            label="Goal changes require manager approval"
            checked={c.changesRequireApproval}
            onChange={(v) => set("changesRequireApproval", v)}
          />
          <Toggle
            label="Allow carry-forward across cycles"
            checked={c.allowCarryForward}
            onChange={(v) => set("allowCarryForward", v)}
          />
          <Toggle
            label="Allow cascading goals"
            checked={c.allowCascade}
            onChange={(v) => set("allowCascade", v)}
          />
        </div>
      </Section>

      <Section title="Comments" desc="Choose who can leave comments on goals and competencies.">
        <div className="grid gap-2 sm:grid-cols-3">
          <Toggle
            label="Employee can comment"
            checked={c.allowEmployeeComments}
            onChange={(v) => set("allowEmployeeComments", v)}
          />
          <Toggle
            label="Line manager can comment"
            checked={c.allowLineManagerComments}
            onChange={(v) => set("allowLineManagerComments", v)}
          />
          <Toggle
            label="Second manager can comment"
            hint="Only used when two reviewers are enabled."
            checked={c.allowSecondManagerComments}
            onChange={(v) => set("allowSecondManagerComments", v)}
          />
        </div>
      </Section>

      <Section title="Reviewers" desc="How many managers review each appraisal.">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-xs text-muted-foreground">
            Reviewers per appraisal
            <select
              value={c.reviewerCount}
              onChange={(e) => set("reviewerCount", Number(e.target.value) === 2 ? 2 : 1)}
              className={cn(field, "mt-0.5 block py-1")}
            >
              <option value={1}>1 — line manager only</option>
              <option value={2}>2 — line manager + second manager</option>
            </select>
          </label>
          <div className="flex-1">
            <Toggle
              label="Blind review"
              hint="Hide the employee's self-rating from the manager until they submit."
              checked={c.blindReview}
              onChange={(v) => set("blindReview", v)}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Scoring"
        desc="Default weighting of the three score components when a new cycle is launched."
      >
        <div className="flex flex-wrap gap-4">
          <label className="text-xs text-muted-foreground">
            Objectives / OKR %
            <input
              type="number"
              min={0}
              max={100}
              value={c.weightOkr}
              onChange={(e) => set("weightOkr", Number(e.target.value))}
              className={cn(field, "mt-0.5 block w-24 py-1")}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Competencies %
            <input
              type="number"
              min={0}
              max={100}
              value={c.weightCompetency}
              onChange={(e) => set("weightCompetency", Number(e.target.value))}
              className={cn(field, "mt-0.5 block w-24 py-1")}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Development %
            <input
              type="number"
              min={0}
              max={100}
              value={c.weightDevelopment}
              onChange={(e) => set("weightDevelopment", Number(e.target.value))}
              className={cn(field, "mt-0.5 block w-24 py-1")}
            />
          </label>
          <div className="self-end text-xs">
            Total:{" "}
            <span className={cn("font-semibold", weightTotal === 100 ? "text-green-700" : "text-destructive")}>
              {weightTotal}%
            </span>
          </div>
        </div>
        <Toggle
          label="Calibration enabled"
          hint="Run a calibration committee step before outcomes are finalised."
          checked={c.calibrationEnabled}
          onChange={(v) => set("calibrationEnabled", v)}
        />
      </Section>

      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          <Save className="h-4 w-4" /> Save settings
        </Button>
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-sm text-green-700">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        {weightTotal !== 100 && (
          <span className="text-xs text-muted-foreground">
            Tip: score weights usually total 100%.
          </span>
        )}
      </div>
    </div>
  );
}
