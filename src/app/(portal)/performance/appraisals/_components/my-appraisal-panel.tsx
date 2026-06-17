"use client";

import { useState, useTransition } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STAGE_LABEL, STATUS_LABEL, type Appraisal, type AppraisalGoal } from "@/types/appraisal";
import {
  acknowledge,
  addGoal,
  deleteGoal,
  rateCompetencySelf,
  submitGoals,
  submitMidYear,
  submitSelfAssessment,
  updateGoalProgress,
} from "../actions";

const EDITABLE = new Set(["not_started", "draft", "returned_for_correction"]);

export function MyAppraisalPanel({ appraisal }: { appraisal: Appraisal }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const editable = EDITABLE.has(appraisal.status);

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
          {appraisal.overall_rating != null ? ` · overall ${appraisal.overall_rating}` : ""}
        </span>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {appraisal.stage === "goal_setting" && (
        <GoalSetting appraisal={appraisal} editable={editable} pending={pending} run={run} />
      )}
      {appraisal.stage === "goal_review" && (
        <MidYear appraisal={appraisal} editable={editable} pending={pending} run={run} />
      )}
      {appraisal.stage === "self_assessment" && (
        <SelfAssessment appraisal={appraisal} editable={editable} pending={pending} run={run} />
      )}
      {["manager_review", "hr_review", "final_discussion", "acknowledgement", "closed"].includes(
        appraisal.stage,
      ) && <ReadOnlyGoals appraisal={appraisal} />}

      {appraisal.stage === "acknowledgement" &&
        appraisal.status === "pending_employee_acknowledgement" && (
          <Acknowledge appraisal={appraisal} pending={pending} run={run} />
        )}

      <History appraisal={appraisal} />
    </section>
  );
}

type RunFn = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;

function GoalSetting({
  appraisal,
  editable,
  pending,
  run,
}: {
  appraisal: Appraisal;
  editable: boolean;
  pending: boolean;
  run: RunFn;
}) {
  const [title, setTitle] = useState("");
  const [weight, setWeight] = useState("");
  const [deadline, setDeadline] = useState("");
  const [indicator, setIndicator] = useState("");
  const totalWeight = appraisal.goals.reduce((s, g) => s + (g.weight ?? 0), 0);

  return (
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
          <Button type="submit" disabled={pending}><Plus className="h-4 w-4" /> Add</Button>
        </form>
      )}
      {editable && appraisal.goals.length > 0 && (
        <div className="mt-3 flex justify-end border-t pt-3">
          <Button disabled={pending} onClick={() => run(() => submitGoals(appraisal.id))}>
            <Send className="h-4 w-4" /> Submit goals for review
          </Button>
        </div>
      )}
      {appraisal.status === "returned_for_correction" && (
        <p className="mt-2 text-xs text-amber-700">Returned for correction — adjust and resubmit.</p>
      )}
    </div>
  );
}

function MidYear({
  appraisal,
  editable,
  pending,
  run,
}: {
  appraisal: Appraisal;
  editable: boolean;
  pending: boolean;
  run: RunFn;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Mid-year progress</h3>
      {appraisal.goals.map((g) => (
        <div key={g.id} className="rounded-md border p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">{g.title}</span>
            <span className="text-xs text-muted-foreground">{g.weight}%</span>
          </div>
          <textarea
            defaultValue={g.employee_progress ?? ""}
            disabled={!editable || pending}
            placeholder="Progress, achievements, challenges…"
            onBlur={(e) => {
              if (e.target.value !== (g.employee_progress ?? ""))
                run(() => updateGoalProgress({ appraisalId: appraisal.id, goalId: g.id, progress: e.target.value }));
            }}
            className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
            rows={2}
          />
          <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              defaultChecked={g.at_risk}
              disabled={!editable || pending}
              onChange={(e) => run(() => updateGoalProgress({ appraisalId: appraisal.id, goalId: g.id, atRisk: e.target.checked }))}
            />
            At risk / delayed
          </label>
        </div>
      ))}
      {editable && (
        <div className="flex justify-end">
          <Button disabled={pending} onClick={() => run(() => submitMidYear(appraisal.id))}>
            <Send className="h-4 w-4" /> Submit mid-year progress
          </Button>
        </div>
      )}
      {appraisal.status === "pending_manager_review" && (
        <p className="text-xs text-muted-foreground">Submitted — awaiting your manager&apos;s review.</p>
      )}
    </div>
  );
}

function SelfAssessment({
  appraisal,
  editable,
  pending,
  run,
}: {
  appraisal: Appraisal;
  editable: boolean;
  pending: boolean;
  run: RunFn;
}) {
  const [summary, setSummary] = useState(appraisal.employee_summary ?? "");
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Year-end self-assessment</h3>
      {appraisal.goals.map((g) => (
        <div key={g.id} className="rounded-md border p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">{g.title}</span>
            <select
              defaultValue={g.employee_self_rating ?? ""}
              disabled={!editable || pending}
              onChange={(e) =>
                run(() => updateGoalProgress({ appraisalId: appraisal.id, goalId: g.id, selfRating: Number(e.target.value) }))
              }
              className="rounded-md border bg-background px-2 py-1 text-sm"
            >
              <option value="">Rate 1–5</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <textarea
            defaultValue={g.employee_comment ?? ""}
            disabled={!editable || pending}
            placeholder="Result, contribution, evidence…"
            onBlur={(e) => {
              if (e.target.value !== (g.employee_comment ?? ""))
                run(() => updateGoalProgress({ appraisalId: appraisal.id, goalId: g.id, employeeComment: e.target.value }));
            }}
            className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
            rows={2}
          />
        </div>
      ))}
      {appraisal.competencies.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Competencies
          </h4>
          {appraisal.competencies.map((c) => (
            <div key={c.competency_id} className="flex items-center justify-between gap-2 rounded-md border p-2">
              <span className="text-sm">{c.name}</span>
              <select
                defaultValue={c.employee_rating ?? ""}
                disabled={!editable || pending}
                onChange={(e) =>
                  run(() => rateCompetencySelf({ appraisalId: appraisal.id, competencyId: c.competency_id, rating: Number(e.target.value) }))
                }
                className="rounded-md border bg-background px-2 py-1 text-sm"
              >
                <option value="">Rate 1–5</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        disabled={!editable || pending}
        placeholder="Overall summary, key accomplishments, development activities…"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        rows={3}
      />
      {editable && (
        <div className="flex justify-end">
          <Button disabled={pending} onClick={() => run(() => submitSelfAssessment({ appraisalId: appraisal.id, summary }))}>
            <Send className="h-4 w-4" /> Submit self-assessment
          </Button>
        </div>
      )}
    </div>
  );
}

function ReadOnlyGoals({ appraisal }: { appraisal: Appraisal }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <h3 className="text-sm font-semibold">Objectives &amp; ratings</h3>
      <ul className="divide-y text-sm">
        {appraisal.goals.map((g) => (
          <li key={g.id} className="py-2">
            <div className="flex justify-between">
              <span className="font-medium">{g.title}</span>
              <span className="text-xs text-muted-foreground">
                {g.weight}%
                {g.employee_self_rating != null ? ` · self ${g.employee_self_rating}` : ""}
                {g.manager_rating != null ? ` · mgr ${g.manager_rating}` : ""}
              </span>
            </div>
            {g.manager_comment && <p className="mt-1 text-xs text-muted-foreground">{g.manager_comment}</p>}
          </li>
        ))}
      </ul>
      {appraisal.competencies.length > 0 && (
        <ul className="border-t pt-2 text-sm">
          {appraisal.competencies.map((c) => (
            <li key={c.competency_id} className="flex justify-between py-0.5">
              <span>{c.name}</span>
              <span className="text-xs text-muted-foreground">
                {c.employee_rating != null ? `self ${c.employee_rating}` : ""}
                {c.manager_rating != null ? ` · mgr ${c.manager_rating}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {appraisal.manager_summary && (
        <p className="border-t pt-2 text-sm"><span className="font-medium">Manager summary: </span>{appraisal.manager_summary}</p>
      )}
      {appraisal.discussion_notes && (
        <p className="text-sm"><span className="font-medium">Discussion: </span>{appraisal.discussion_notes}</p>
      )}
      {appraisal.acknowledged_at && (
        <p className="text-xs text-muted-foreground">
          Acknowledged {appraisal.employee_agreed ? "(agreed)" : "(disagreed)"} on{" "}
          {new Date(appraisal.acknowledged_at).toLocaleDateString()}
        </p>
      )}
      {appraisal.appeal && (
        <p className="text-xs text-amber-700">
          Appeal {appraisal.appeal.status === "resolved" ? "resolved" : "under review"}
          {appraisal.appeal.decision ? ` — ${appraisal.appeal.decision}` : ""}
        </p>
      )}
    </div>
  );
}

function Acknowledge({
  appraisal,
  pending,
  run,
}: {
  appraisal: Appraisal;
  pending: boolean;
  run: RunFn;
}) {
  const [comment, setComment] = useState("");
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <h3 className="text-sm font-semibold">Acknowledge your appraisal</h3>
      <p className="text-xs text-muted-foreground">
        Acknowledging confirms the discussion took place. You can agree, or acknowledge but record
        your disagreement.
      </p>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        disabled={pending}
        placeholder="Your comments (optional)"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        rows={2}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(() => acknowledge({ appraisalId: appraisal.id, agreed: false, comment }))}
        >
          Acknowledge — I disagree
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(() => acknowledge({ appraisalId: appraisal.id, agreed: true, comment }))}
        >
          Accept appraisal
        </Button>
      </div>
    </div>
  );
}

function History({ appraisal }: { appraisal: Appraisal }) {
  if (appraisal.events.length === 0) return null;
  return (
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
  );
}
