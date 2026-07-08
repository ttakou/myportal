"use client";

import { useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CHECK_IN_FREQUENCIES,
  CHECK_IN_FREQUENCY_LABEL,
  FEATURE_KEYS,
  FEATURE_LABEL,
  FEEDBACK_INITIATORS,
  FEEDBACK_INITIATOR_LABEL,
  type CheckInFrequency,
  type CheckInQuestion,
  type ContinuousConfig,
  type FeatureKey,
  type FeedbackInitiator,
  type PulseQuestion,
} from "@/types/continuous";
import { saveContinuousConfig } from "../continuous-actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
const rid = () => Math.random().toString(36).slice(2, 9);

export function ContinuousSettingsForm({ config }: { config: ContinuousConfig }) {
  const [c, setC] = useState<ContinuousConfig>(config);
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof ContinuousConfig>(k: K, v: ContinuousConfig[K]) => {
    setSaved(false);
    setC({ ...c, [k]: v });
  };
  const toggleInitiator = (i: FeedbackInitiator) =>
    set(
      "feedbackInitiators",
      c.feedbackInitiators.includes(i)
        ? c.feedbackInitiators.filter((x) => x !== i)
        : [...c.feedbackInitiators, i],
    );
  const toggleFeature = (k: FeatureKey) =>
    set("enabledFeatures", { ...c.enabledFeatures, [k]: !c.enabledFeatures[k] });

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveContinuousConfig(c);
      if (!res.ok) setError(res.error ?? "Couldn't save.");
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-5">
      {/* Features */}
      <Section title="Features" desc="Switch continuous-performance features on or off for everyone.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_KEYS.map((k) => (
            <Toggle key={k} label={FEATURE_LABEL[k]} checked={c.enabledFeatures[k]} onChange={() => toggleFeature(k)} />
          ))}
        </div>
      </Section>

      {/* Check-ins */}
      <Section title="Check-ins" desc="Cadence and the questions asked at each check-in.">
        <label className="block text-xs text-muted-foreground sm:w-1/2">
          Frequency
          <select
            value={c.checkInFrequency}
            onChange={(e) => set("checkInFrequency", e.target.value as CheckInFrequency)}
            className={cn(field, "mt-0.5 block w-full py-1.5")}
          >
            {CHECK_IN_FREQUENCIES.map((f) => (
              <option key={f} value={f}>{CHECK_IN_FREQUENCY_LABEL[f]}</option>
            ))}
          </select>
        </label>
        <QuestionList
          title="Check-in questions"
          items={c.checkInTemplate}
          onChange={(items) => set("checkInTemplate", items as CheckInQuestion[])}
          withRequired
        />
      </Section>

      {/* Feedback */}
      <Section title="Feedback" desc="Who can ask for feedback and how it's handled.">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Who can initiate feedback</p>
          <div className="flex flex-wrap gap-1.5">
            {FEEDBACK_INITIATORS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleInitiator(i)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  c.feedbackInitiators.includes(i)
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {FEEDBACK_INITIATOR_LABEL[i]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle label="Feedback can be anonymous" checked={c.feedbackAnonymous} onChange={(v) => set("feedbackAnonymous", v)} />
          <Toggle label="Feedback appears in the appraisal" checked={c.feedbackInAppraisal} onChange={(v) => set("feedbackInAppraisal", v)} />
        </div>
      </Section>

      {/* Pulse */}
      <Section title="Employee pulse" desc="Recurring questions to gauge sentiment.">
        <QuestionList
          title="Pulse questions"
          items={c.pulseQuestions}
          onChange={(items) => set("pulseQuestions", items as PulseQuestion[])}
          withScale
        />
      </Section>

      {/* Notes */}
      <Section title="Manager notes" desc="Privacy of manager-authored notes.">
        <Toggle
          label="Allow private manager notes (not visible to the employee)"
          checked={c.allowPrivateManagerNotes}
          onChange={(v) => set("allowPrivateManagerNotes", v)}
        />
      </Section>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          <Check className="h-4 w-4" /> Save settings
        </Button>
        {saved && !pending && <span className="text-sm text-green-700">Saved</span>}
      </div>
    </div>
  );
}

type Q = { id: string; label: string; required?: boolean; scale?: number };

function QuestionList({
  title,
  items,
  onChange,
  withRequired,
  withScale,
}: {
  title: string;
  items: Q[];
  onChange: (items: Q[]) => void;
  withRequired?: boolean;
  withScale?: boolean;
}) {
  const update = (i: number, patch: Partial<Q>) =>
    onChange(items.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const add = () =>
    onChange([...items, { id: rid(), label: "", required: false, ...(withScale ? { scale: 5 } : {}) }]);
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));

  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{title}</p>
      <div className="space-y-2">
        {items.map((q, i) => (
          <div key={q.id} className="flex flex-wrap items-center gap-2">
            <input
              value={q.label}
              placeholder="Question…"
              onChange={(e) => update(i, { label: e.target.value })}
              className={cn(field, "min-w-[12rem] flex-1 py-1.5")}
            />
            {withRequired && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={!!q.required} onChange={(e) => update(i, { required: e.target.checked })} className="h-4 w-4" />
                Required
              </label>
            )}
            {withScale && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Scale
                <input
                  type="number"
                  min={2}
                  max={10}
                  value={q.scale ?? 5}
                  onChange={(e) => update(i, { scale: Number(e.target.value) })}
                  className={cn(field, "w-16 py-1")}
                />
              </label>
            )}
            <Button variant="ghost" size="sm" onClick={() => remove(i)} aria-label="Remove question">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="mt-2" onClick={add}>
        <Plus className="h-4 w-4" /> Add question
      </Button>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      {children}
    </section>
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
