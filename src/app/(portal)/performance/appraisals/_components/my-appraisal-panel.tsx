"use client";

import { useState, useTransition } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STAGE_LABEL, STATUS_LABEL, type Appraisal } from "@/types/appraisal";
import { addGoal, deleteGoal, submitGoals } from "../actions";

const EDITABLE = new Set(["not_started", "draft", "returned_for_correction"]);

export function MyAppraisalPanel({ appraisal }: { appraisal: Appraisal }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [weight, setWeight] = useState("");
  const [deadline, setDeadline] = useState("");
  const [indicator, setIndicator] = useState("");

  const editable = appraisal.stage === "goal_setting" && EDITABLE.has(appraisal.status);
  const totalWeight = appraisal.goals.reduce((s, g) => s + (g.weight ?? 0), 0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">My appraisal</h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {STAGE_LABEL[appraisal.stage]} · {STATUS_LABEL[appraisal.status]}
        </span>
      </div>
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Objectives</h3>
          <span className={`text-xs ${totalWeight === 100 ? "text-green-600" : "text-muted-foreground"}`}>
            Total weight: {totalWeight}%
          </span>
        </div>

        {appraisal.goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No objectives yet.</p>
        ) : (
          <ul className="divide-y">
            {appraisal.goals.map((g) => (
              <li key={g.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium">{g.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.weight}%{g.deadline ? ` · due ${g.deadline}` : ""}
                    {g.success_indicator ? ` · ${g.success_indicator}` : ""}
                  </div>
                </div>
                {editable && (
                  <button
                    type="button"
                    aria-label="Remove"
                    disabled={pending}
                    onClick={() => run(() => deleteGoal({ goalId: g.id, appraisalId: appraisal.id }))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <form
            className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  addGoal({
                    appraisalId: appraisal.id,
                    title,
                    weight: Number(weight) || 0,
                    deadline: deadline || undefined,
                    successIndicator: indicator || undefined,
                  }),
                () => {
                  setTitle("");
                  setWeight("");
                  setDeadline("");
                  setIndicator("");
                },
              );
            }}
          >
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Objective" required className="rounded-md border bg-background px-3 py-2 text-sm lg:col-span-2" />
            <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" min={0} max={100} placeholder="Weight %" className="rounded-md border bg-background px-3 py-2 text-sm" />
            <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date" className="rounded-md border bg-background px-3 py-2 text-sm" />
            <input value={indicator} onChange={(e) => setIndicator(e.target.value)} placeholder="Success indicator (optional)" className="rounded-md border bg-background px-3 py-2 text-sm lg:col-span-3" />
            <Button type="submit" disabled={pending}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </form>
        )}

        {editable && appraisal.goals.length > 0 && (
          <div className="mt-3 flex justify-end border-t pt-3">
            <Button
              disabled={pending}
              onClick={() => run(() => submitGoals(appraisal.id))}
            >
              <Send className="h-4 w-4" /> Submit goals for review
            </Button>
          </div>
        )}

        {appraisal.status === "returned_for_correction" && (
          <p className="mt-2 text-xs text-amber-700">
            Your manager returned your goals for correction — adjust and resubmit.
          </p>
        )}
      </div>

      {appraisal.events.length > 0 && (
        <details className="rounded-lg border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">History</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {appraisal.events.map((e) => (
              <li key={e.id}>
                <span className="text-foreground">{e.action.replace(/_/g, " ")}</span>
                {e.actor_name ? ` · ${e.actor_name}` : ""} · {new Date(e.created_at).toLocaleString()}
                {e.comment ? ` — ${e.comment}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
