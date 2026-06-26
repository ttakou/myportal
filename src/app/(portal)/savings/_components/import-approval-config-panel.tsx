"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { GitBranch, Plus, Trash2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { setSavingsImportSteps, type SavingsImportStep } from "../actions";

/**
 * Configure how a monthly import is validated before it commits: zero steps =
 * the importer commits directly; one or more steps each route the import to a
 * set of validators (any one advances the step).
 */
export function ImportApprovalConfigPanel({
  users,
  steps: initial,
}: {
  users: { id: string; name: string }[];
  steps: SavingsImportStep[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [steps, setSteps] = useState<SavingsImportStep[]>(
    initial.length ? initial.map((s) => ({ name: s.name, validators: [...s.validators] })) : [],
  );

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "Unknown";

  function addStep() {
    setOk(false);
    setSteps((s) => [...s, { name: `Step ${s.length + 1}`, validators: [] }]);
  }
  function removeStep(i: number) {
    setOk(false);
    setSteps((s) => s.filter((_, idx) => idx !== i));
  }
  function rename(i: number, name: string) {
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, name } : st)));
  }
  function toggleValidator(i: number, id: string) {
    setOk(false);
    setSteps((s) =>
      s.map((st, idx) =>
        idx === i
          ? { ...st, validators: st.validators.includes(id) ? st.validators.filter((v) => v !== id) : [...st.validators, id] }
          : st,
      ),
    );
  }

  function save() {
    setError(null);
    setOk(false);
    const bad = steps.find((s) => s.validators.length === 0);
    if (bad) {
      setError("Every step needs at least one validator (or remove the step).");
      return;
    }
    startTransition(async () => {
      const res = await setSavingsImportSteps(steps);
      if (!res.ok) {
        setError(res.error ?? "Could not save.");
        return;
      }
      setOk(true);
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <GitBranch className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Import approval workflow</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Decide how a monthly import is validated before it is committed. With no steps the importer
        commits directly. Add steps to route it through validators — any one validator on a step
        advances it; the last step commits the import.
      </p>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {ok && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Workflow saved — {steps.length === 0 ? "imports commit directly." : `${steps.length} step(s).`}
        </p>
      )}

      <div className="space-y-3 rounded-lg border bg-card p-4">
        {steps.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No approval steps — imports are committed directly by the importer.
          </p>
        )}

        {steps.map((step, i) => (
          <div key={i} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <input
                value={step.name}
                onChange={(e) => rename(i, e.target.value)}
                placeholder={`Step ${i + 1} name`}
                className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeStep(i)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Remove step"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Validators {step.validators.length > 0 && `(${step.validators.length})`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {users.map((u) => {
                  const on = step.validators.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleValidator(i, u.id)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        on ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {on && <Check className="mr-1 inline h-3 w-3" />}
                      {u.name}
                    </button>
                  );
                })}
              </div>
              {step.validators.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Any one of: {step.validators.map(nameOf).join(", ")}
                </p>
              )}
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between">
          <Button size="sm" variant="outline" onClick={addStep} disabled={pending}>
            <Plus className="h-4 w-4" /> Add step
          </Button>
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save workflow"}
          </Button>
        </div>
      </div>
    </section>
  );
}
