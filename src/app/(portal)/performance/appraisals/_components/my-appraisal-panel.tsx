"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  STAGE_LABEL,
  STATUS_LABEL,
  type Appraisal,
  type AppraisalGoal,
  type Colleague,
  type DepartmentObjective,
} from "@/types/appraisal";
import {
  acknowledge,
  addDevelopmentItem,
  addGoal,
  addGoalRater,
  addKeyResult,
  deleteDevelopmentItem,
  deleteGoal,
  deleteKeyResult,
  rateCompetencySelf,
  removeGoalRater,
  setDevelopmentStatus,
  submitGoals,
  submitMidYear,
  submitSelfAssessment,
  updateGoal,
  updateGoalProgress,
  updateKeyResultProgress,
} from "../actions";

const DEV_STATUS_LABEL: Record<"planned" | "in_progress" | "done", string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
};

const EDITABLE = new Set([
  "not_started",
  "draft",
  "returned_for_correction",
  "pending_manager_review",
]);

export type GoalLibraryItem = {
  id: string;
  title: string;
  description: string | null;
  defaultWeight: number;
  level: string;
};

export function MyAppraisalPanel({
  appraisal,
  colleagues = [],
  deptObjectives = [],
  goalTemplates = [],
}: {
  appraisal: Appraisal;
  colleagues?: Colleague[];
  deptObjectives?: DepartmentObjective[];
  goalTemplates?: GoalLibraryItem[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  // In a gate cycle the year's goals are shown read-only — they're set/edited in
  // the Annual cycle — so never offer goal editing here.
  const editable = !appraisal.goalsReadOnly && EDITABLE.has(appraisal.status);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <section id="my-appraisal" className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">My appraisal</h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {STAGE_LABEL[appraisal.stage]} · {STATUS_LABEL[appraisal.status]}
          {appraisal.final_score != null
            ? ` · ${appraisal.final_score}% · ${appraisal.rating_label ?? ""}`
            : ""}
        </span>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {appraisal.goalsReadOnly && (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          Showing your goals and development plan for the year{appraisal.goalsSourceName ? ` — set in ${appraisal.goalsSourceName}` : ""}.
          Edit them in that cycle; here they&apos;re read-only.
        </p>
      )}

      {appraisal.stage === "goal_setting" && (
        <GoalSetting
          appraisal={appraisal}
          editable={editable}
          pending={pending}
          run={run}
          colleagues={colleagues}
          deptObjectives={deptObjectives}
          goalTemplates={goalTemplates}
        />
      )}
      {appraisal.stage === "goal_review" && (
        <MidYear appraisal={appraisal} editable={editable} pending={pending} run={run} />
      )}
      {appraisal.stage === "self_assessment" && (
        <SelfAssessment
          appraisal={appraisal}
          editable={editable}
          pending={pending}
          run={run}
          colleagues={colleagues}
        />
      )}
      {["manager_review", "hr_review", "final_discussion", "acknowledgement", "closed"].includes(
        appraisal.stage,
      ) && <ReadOnlyGoals appraisal={appraisal} />}

      {appraisal.stage === "acknowledgement" &&
        appraisal.status === "pending_employee_acknowledgement" && (
          <Acknowledge appraisal={appraisal} pending={pending} run={run} />
        )}

      <DevelopmentPlan appraisal={appraisal} pending={pending} run={run} />

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
  colleagues,
  deptObjectives,
  goalTemplates,
}: {
  appraisal: Appraisal;
  editable: boolean;
  pending: boolean;
  run: RunFn;
  colleagues: Colleague[];
  deptObjectives: DepartmentObjective[];
  goalTemplates: GoalLibraryItem[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [weight, setWeight] = useState("");
  const [deadline, setDeadline] = useState("");
  const [indicator, setIndicator] = useState("");
  const [alignment, setAlignment] = useState("");
  const [kind, setKind] = useState<"objective" | "development">("objective");
  // Objective (OKR) weights must total 100% — development goals are weighted
  // separately by the cycle, so they're excluded from this total.
  const objectiveWeight = appraisal.goals
    .filter((g) => g.kind === "objective")
    .reduce((s, g) => s + (g.weight ?? 0), 0);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Objectives</h3>
        <span
          className={`text-xs font-medium ${objectiveWeight === 100 ? "text-green-600" : "text-amber-600"}`}
        >
          Objective weight: {objectiveWeight}%{objectiveWeight === 100 ? "" : " — must total 100%"}
        </span>
      </div>
      {appraisal.goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">No objectives yet.</p>
      ) : (
        <ul className="divide-y">
          {appraisal.goals.map((g) => (
            <GoalRow
              key={g.id}
              goal={g}
              appraisalId={appraisal.id}
              editable={editable}
              pending={pending}
              run={run}
              colleagues={colleagues}
            />
          ))}
        </ul>
      )}
      {editable && (
        <form
          className="mt-3 space-y-2 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                addGoal({
                  appraisalId: appraisal.id,
                  title,
                  description: description || undefined,
                  weight: Number(weight) || 0,
                  deadline: deadline || undefined,
                  successIndicator: indicator || undefined,
                  alignment: alignment || undefined,
                  kind,
                }),
              () => {
                setTitle("");
                setDescription("");
                setWeight("");
                setDeadline("");
                setIndicator("");
                setAlignment("");
                setKind("objective");
              },
            );
          }}
        >
          {goalTemplates.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Start from the goal library (optional)
              </label>
              <select
                value=""
                onChange={(e) => {
                  const t = goalTemplates.find((x) => x.id === e.target.value);
                  if (!t) return;
                  setTitle(t.title);
                  if (t.description) setDescription(t.description);
                  if (t.defaultWeight) setWeight(String(t.defaultWeight));
                  setKind("objective");
                }}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">Choose a library goal…</option>
                {goalTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.level}] {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Objective title"
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What the objective involves, scope, context…"
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-medium text-muted-foreground">
              Weight %
              <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" min={0} max={100} placeholder="0" className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Deadline
              <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date" className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Type
              <select value={kind} onChange={(e) => setKind(e.target.value as "objective" | "development")} className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="objective">Objective</option>
                <option value="development">Development</option>
              </select>
            </label>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Business alignment {deptObjectives.length > 0 ? "(department objective)" : "(optional)"}
            </label>
            {deptObjectives.length > 0 ? (
              <select
                value={alignment}
                onChange={(e) => setAlignment(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">— Align to a department objective —</option>
                {deptObjectives.map((o) => (
                  <option key={o.id} value={o.title}>
                    {o.department ? `[${o.department}] ` : "[All] "}
                    {o.title}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={alignment}
                onChange={(e) => setAlignment(e.target.value)}
                placeholder="How this supports the business (optional)"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Success indicator</label>
            <textarea
              value={indicator}
              onChange={(e) => setIndicator(e.target.value)}
              placeholder="How success is measured — target, metric, evidence…"
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}><Plus className="h-4 w-4" /> Add objective</Button>
          </div>
        </form>
      )}
      {editable && appraisal.goals.length > 0 && appraisal.status !== "pending_manager_review" && (
        <div className="mt-3 flex justify-end border-t pt-3">
          <Button disabled={pending} onClick={() => run(() => submitGoals(appraisal.id))}>
            <Send className="h-4 w-4" /> Submit goals for review
          </Button>
        </div>
      )}
      {appraisal.status === "pending_manager_review" && (
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          Submitted for review. You can still edit your objectives until your manager starts the
          review.
        </p>
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
          <KrProgress goal={g} appraisalId={appraisal.id} editable={editable} pending={pending} run={run} />
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
  colleagues,
}: {
  appraisal: Appraisal;
  editable: boolean;
  pending: boolean;
  run: RunFn;
  colleagues: Colleague[];
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
          <KrProgress goal={g} appraisalId={appraisal.id} editable={editable} pending={pending} run={run} />
          <GoalReviewers
            goal={g}
            appraisalId={appraisal.id}
            editable={appraisal.status !== "closed"}
            pending={pending}
            run={run}
            colleagues={colleagues}
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
      {appraisal.final_score != null && (
        <div className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium">Final outcome</span>
          <span className="text-sm font-semibold text-primary">
            {appraisal.final_score}%{appraisal.rating_label ? ` · ${appraisal.rating_label}` : ""}
          </span>
        </div>
      )}
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
            {g.key_results.length > 0 && (
              <ul className="mt-1 space-y-0.5 pl-3 text-xs text-muted-foreground">
                {g.key_results.map((k) => (
                  <li key={k.id}>
                    • {k.title} — {k.progress}%
                    {k.current_value ? ` (${k.current_value}${k.target ? ` / ${k.target}` : ""})` : ""}
                  </li>
                ))}
              </ul>
            )}
            {g.manager_comment && <p className="mt-1 text-xs text-muted-foreground">{g.manager_comment}</p>}
            {g.raters.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Stakeholder reviewers:{" "}
                {g.raters
                  .map((r) => `${r.rater_name ?? "—"} (${r.status === "submitted" ? "responded" : "invited"})`)
                  .join(", ")}
              </p>
            )}
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

/** Individual development plan — visible always; editable until the appraisal closes. */
function DevelopmentPlan({
  appraisal,
  pending,
  run,
}: {
  appraisal: Appraisal;
  pending: boolean;
  run: RunFn;
}) {
  const [area, setArea] = useState("");
  const [action, setAction] = useState("");
  const [targetDate, setTargetDate] = useState("");
  // In a gate cycle the IDP (like goals) belongs to the Annual cycle — read-only.
  const editable = !appraisal.goalsReadOnly && appraisal.status !== "closed";
  const items = appraisal.development_plan;

  if (!editable && items.length === 0) return null;

  return (
    <div id="development-plan" className="scroll-mt-24 rounded-lg border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Development plan</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No development actions yet.</p>
      ) : (
        <ul className="divide-y">
          {items.map((it) => (
            <li key={it.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="font-medium">{it.area}</div>
                {it.action && <div className="text-sm text-muted-foreground">{it.action}</div>}
                <div className="text-xs text-muted-foreground">
                  {it.target_date ? `Target ${it.target_date}` : "No target date"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {editable ? (
                  <select
                    value={it.status}
                    disabled={pending}
                    onChange={(e) =>
                      run(() =>
                        setDevelopmentStatus({
                          appraisalId: appraisal.id,
                          itemId: it.id,
                          status: e.target.value as "planned" | "in_progress" | "done",
                        }),
                      )
                    }
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                  >
                    {(["planned", "in_progress", "done"] as const).map((s) => (
                      <option key={s} value={s}>{DEV_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {DEV_STATUS_LABEL[it.status]}
                  </span>
                )}
                {editable && (
                  <button
                    type="button"
                    aria-label="Remove"
                    disabled={pending}
                    onClick={() => run(() => deleteDevelopmentItem({ appraisalId: appraisal.id, itemId: it.id }))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
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
                addDevelopmentItem({
                  appraisalId: appraisal.id,
                  area,
                  action: action || undefined,
                  targetDate: targetDate || undefined,
                }),
              () => {
                setArea("");
                setAction("");
                setTargetDate("");
              },
            );
          }}
        >
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Development area" required className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action / how (optional)" className="rounded-md border bg-background px-3 py-2 text-sm lg:col-span-2" />
          <input value={targetDate} onChange={(e) => setTargetDate(e.target.value)} type="date" className="rounded-md border bg-background px-3 py-2 text-sm" />
          <Button type="submit" disabled={pending || !area.trim()} className="sm:col-span-2 lg:col-span-4 lg:justify-self-end">
            <Plus className="h-4 w-4" /> Add development action
          </Button>
        </form>
      )}
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

/** One objective in goal-setting: read view + inline edit, KRs and witness. */
function GoalRow({
  goal: g,
  appraisalId,
  editable,
  pending,
  run,
  colleagues,
}: {
  goal: AppraisalGoal;
  appraisalId: string;
  editable: boolean;
  pending: boolean;
  run: RunFn;
  colleagues: Colleague[];
}) {
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(g.title);
  const [description, setDescription] = useState(g.description ?? "");
  const [weight, setWeight] = useState(String(g.weight ?? 0));
  const [deadline, setDeadline] = useState(g.deadline ?? "");
  const [indicator, setIndicator] = useState(g.success_indicator ?? "");

  return (
    <li className="py-2">
      {edit ? (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Objective title" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={2} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" min={0} max={100} placeholder="Weight %" className="rounded-md border bg-background px-3 py-2 text-sm" />
            <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date" className="rounded-md border bg-background px-3 py-2 text-sm" />
          </div>
          <textarea value={indicator} onChange={(e) => setIndicator(e.target.value)} placeholder="Success indicator" rows={2} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEdit(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={pending || !title.trim()}
              onClick={() =>
                run(
                  () =>
                    updateGoal({
                      goalId: g.id,
                      appraisalId,
                      title,
                      description,
                      weight: Number(weight) || 0,
                      deadline: deadline || undefined,
                      successIndicator: indicator,
                    }),
                  () => setEdit(false),
                )
              }
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium">
              {g.title}
              {g.kind === "development" && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                  development
                </span>
              )}
            </div>
            {g.description && <div className="text-sm text-muted-foreground">{g.description}</div>}
            <div className="text-xs text-muted-foreground">
              {g.weight}%{g.deadline ? ` · due ${g.deadline}` : ""}
              {g.alignment ? ` · ${g.alignment}` : ""}
              {g.success_indicator ? ` · ${g.success_indicator}` : ""}
            </div>
          </div>
          {editable && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setEdit(true)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Edit
              </button>
              <button
                type="button"
                aria-label="Remove"
                disabled={pending}
                onClick={() => run(() => deleteGoal({ goalId: g.id, appraisalId }))}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
      <GoalKeyResults goal={g} appraisalId={appraisalId} editable={editable} pending={pending} run={run} />
      <GoalReviewers
        goal={g}
        appraisalId={appraisalId}
        editable={editable}
        pending={pending}
        run={run}
        colleagues={colleagues}
      />
    </li>
  );
}

/** Define key results for an objective during goal-setting. */
function GoalKeyResults({
  goal,
  appraisalId,
  editable,
  pending,
  run,
}: {
  goal: AppraisalGoal;
  appraisalId: string;
  editable: boolean;
  pending: boolean;
  run: RunFn;
}) {
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  return (
    <div className="mt-2 space-y-1 pl-3">
      {goal.key_results.map((k) => (
        <div key={k.id} className="flex items-center justify-between gap-2 text-xs">
          <span>
            • {k.title}
            {k.target ? <span className="text-muted-foreground"> → {k.target}{k.unit ? ` ${k.unit}` : ""}</span> : null}
          </span>
          {editable && (
            <button
              type="button"
              aria-label="Remove key result"
              disabled={pending}
              onClick={() => run(() => deleteKeyResult({ appraisalId, krId: k.id }))}
              className="text-muted-foreground hover:text-destructive"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {editable && (
        <form
          className="flex flex-wrap gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addKeyResult({ appraisalId, goalId: goal.id, title, target: target || undefined }),
              () => {
                setTitle("");
                setTarget("");
              },
            );
          }}
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Key result" className="flex-1 rounded-md border bg-background px-2 py-1 text-xs" />
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target" className="w-28 rounded-md border bg-background px-2 py-1 text-xs" />
          <button type="submit" disabled={pending || !title.trim()} className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50">
            + KR
          </button>
        </form>
      )}
    </div>
  );
}

/** Attach business stakeholders to an objective to rate the employee on it.
 *  The employee sees who is attached and whether they responded, but never the
 *  rating or comment — those are confidential to the line manager. */
function GoalReviewers({
  goal,
  appraisalId,
  editable,
  pending,
  run,
  colleagues,
}: {
  goal: AppraisalGoal;
  appraisalId: string;
  editable: boolean;
  pending: boolean;
  run: RunFn;
  colleagues: Colleague[];
}) {
  const [raterId, setRaterId] = useState("");
  const [query, setQuery] = useState("");
  const attached = new Set(goal.raters.map((r) => r.rater_id));
  const q = query.trim().toLowerCase();
  const options = colleagues
    .filter((c) => !attached.has(c.id))
    .filter(
      (c) =>
        !q ||
        (c.full_name ?? "").toLowerCase().includes(q) ||
        (c.department ?? "").toLowerCase().includes(q),
    )
    .slice(0, 50);

  if (!editable && goal.raters.length === 0) return null;

  return (
    <div className="mt-2 space-y-1 pl-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Witness
      </div>
      {goal.raters.length > 0 ? (
        <ul className="space-y-0.5">
          {goal.raters.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
              <span>
                {r.rater_name ?? "—"}
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${
                    r.status === "submitted"
                      ? "bg-green-100 text-green-700"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {r.status === "submitted" ? "responded" : "invited"}
                </span>
              </span>
              {editable && (
                <button
                  type="button"
                  aria-label="Remove witness"
                  disabled={pending}
                  onClick={() => run(() => removeGoalRater({ appraisalId, raterRowId: r.id }))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No witness yet.</p>
      )}
      {editable && goal.raters.length === 0 && (
        <form
          className="flex flex-wrap gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!raterId) return;
            run(
              () => addGoalRater({ appraisalId, goalId: goal.id, raterId }),
              () => {
                setRaterId("");
                setQuery("");
              },
            );
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people by name or department…"
            className="w-full rounded-md border bg-background px-2 py-1 text-xs"
          />
          <select
            value={raterId}
            onChange={(e) => setRaterId(e.target.value)}
            className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
          >
            <option value="">{q ? `Select (${options.length})…` : "Choose a witness…"}</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name ?? "—"}
                {c.department ? ` · ${c.department}` : ""}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending || !raterId}
            className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
          >
            Assign
          </button>
        </form>
      )}
      {editable && goal.raters.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          One witness per objective. They get a Witness role to rate this goal; their rating and
          comments are shared only with your line manager.
        </p>
      )}
    </div>
  );
}

/** Track key-result progress continuously (mid-year / self-assessment). */
function KrProgress({
  goal,
  appraisalId,
  editable,
  pending,
  run,
}: {
  goal: AppraisalGoal;
  appraisalId: string;
  editable: boolean;
  pending: boolean;
  run: RunFn;
}) {
  if (goal.key_results.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 pl-3">
      {goal.key_results.map((k) => (
        <div key={k.id} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="min-w-[120px] flex-1">• {k.title}{k.target ? ` (→ ${k.target})` : ""}</span>
          <input
            type="number"
            min={0}
            max={100}
            defaultValue={k.progress}
            disabled={!editable || pending}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v !== k.progress) run(() => updateKeyResultProgress({ appraisalId, krId: k.id, progress: v }));
            }}
            className="w-16 rounded-md border bg-background px-2 py-1 text-xs"
          />
          <span className="text-muted-foreground">%</span>
          <input
            defaultValue={k.current_value ?? ""}
            disabled={!editable || pending}
            placeholder="Actual"
            onBlur={(e) => {
              if (e.target.value !== (k.current_value ?? ""))
                run(() => updateKeyResultProgress({ appraisalId, krId: k.id, currentValue: e.target.value }));
            }}
            className="w-24 rounded-md border bg-background px-2 py-1 text-xs"
          />
        </div>
      ))}
    </div>
  );
}
