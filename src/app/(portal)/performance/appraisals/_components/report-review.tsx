"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Check, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityRecap } from "./activity-recap";
import { GoalWeight } from "./goal-weight";
import type { PersonActivity } from "@/lib/performance/goal-activity";
import { reviewControls } from "@/lib/performance/review-controls";
import type { Appraisal } from "@/types/appraisal";
import {
  approveGoals,
  completeMidYear,
  rateCompetencyManager,
  recordDiscussion,
  returnGoals,
  setManagerComment,
  setManagerRating,
  submitManagerEvaluation,
} from "../actions";

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;

/**
 * One report's appraisal as the line manager reviews it.
 *
 * This is the manager's own card, lifted out so that whoever stands in for the
 * manager sees the same thing. The stand-in's page used to show a read-only
 * table of titles and weights and one comment box: no progress against the
 * goals, none of the employee's notes, nothing they had posted on Continuous,
 * no self-assessment, and none of the manager's decisions. An administrator
 * covering for a manager on rotation could see neither what the employee had
 * achieved nor the buttons the manager would have pressed — which is the whole
 * of the job they came to do.
 *
 * `canReview` is false for a visitor who is not here as the manager: they get
 * the achievements and none of the controls.
 */
export function ReportReview({
  appraisal: a,
  activity,
  canReview,
  reviewerName,
}: {
  appraisal: Appraisal;
  activity?: PersonActivity | null;
  canReview: boolean;
  /** Whose remarks these are, when written by somebody standing in for them. */
  reviewerName?: string | null;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState(a.manager_summary ?? "");
  const [discDate, setDiscDate] = useState("");
  const [discNotes, setDiscNotes] = useState("");

  const run: Run = (fn, onOk) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  };

  const c = reviewControls({
    stage: a.stage,
    status: a.status,
    goalsReadOnly: a.goalsReadOnly,
    goalCount: a.goals.length,
  });
  const evaluating = canReview && c.evaluating;

  return (
    <>
      {a.goalsReadOnly && (
        <p className="mt-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs text-muted-foreground">
          Goals for the year{a.goalsSourceName ? ` — set in ${a.goalsSourceName}` : ""}. Read-only
          here; rated in that cycle.
        </p>
      )}

      {a.goals.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No objectives recorded yet. These are the employee&apos;s own to write — if they cannot
          reach the system, the goals have to come from them before the phase can move.
        </p>
      ) : (
        <ul className="mt-2 divide-y text-sm">
          {a.goals.map((g) => (
            <li key={g.id} className="py-1.5">
              <div className="flex justify-between gap-3">
                <span>
                  {g.title}
                  {g.at_risk ? <span className="ml-1 text-xs text-amber-700">(at risk)</span> : ""}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {/* The figure the employee entered at mid-year. It was captured
                      and then shown nowhere a reviewer looks. */}
                  {g.progress_percent != null && (
                    <span
                      title="Progress the employee reported"
                      className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums"
                    >
                      {g.progress_percent}% done
                    </span>
                  )}
                  {g.employee_self_rating != null && (
                    <span className="text-xs text-muted-foreground">
                      self {g.employee_self_rating}
                    </span>
                  )}
                  {g.manager_rating != null && (
                    <span className="text-xs font-medium">mgr {g.manager_rating}</span>
                  )}
                  <GoalWeight weight={g.weight} />
                </span>
              </div>
              {g.description && (
                <p className="mt-0.5 text-xs text-muted-foreground">{g.description}</p>
              )}
              {(g.success_indicator || g.alignment) && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {g.success_indicator ? `KPI: ${g.success_indicator}` : ""}
                  {g.success_indicator && g.alignment ? " · " : ""}
                  {g.alignment ? `Aligned to: ${g.alignment}` : ""}
                </p>
              )}
              {g.key_results.length > 0 && (
                <div className="mt-1 pl-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Key results
                  </p>
                  <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                    {g.key_results.map((k) => (
                      <li key={k.id} className="flex justify-between gap-3">
                        <span>
                          • {k.title}
                          {k.target ? ` (→ ${k.target})` : ""}
                          {k.current_value ? ` · now ${k.current_value}${k.unit ?? ""}` : ""}
                        </span>
                        <span className="shrink-0 tabular-nums">{k.progress}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(g.employee_progress || g.employee_comment) && (
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                  {g.employee_progress || g.employee_comment}
                </p>
              )}
              {g.manager_comment && !evaluating && (
                <p className="mt-0.5 text-xs">
                  <span className="font-medium">{reviewerName ?? "Manager"}: </span>
                  <span className="text-muted-foreground">{g.manager_comment}</span>
                </p>
              )}
              {g.raters.length > 0 && (
                <div className="mt-1 rounded-md bg-muted/50 px-2 py-1 text-xs">
                  <span className="font-medium">Witness feedback</span>
                  <span className="text-muted-foreground"> (confidential)</span>
                  <ul className="mt-0.5 space-y-0.5">
                    {g.raters.map((r) => (
                      <li key={r.id}>
                        {r.rater_name ?? "—"}:{" "}
                        {r.status === "submitted" ? (
                          <>
                            <span className="font-medium">{r.rating ?? "—"}/5</span>
                            {r.comment ? (
                              <span className="text-muted-foreground"> — {r.comment}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">awaiting response</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {evaluating && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <select
                    defaultValue={g.manager_rating ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      run(() =>
                        setManagerRating({
                          appraisalId: a.id,
                          goalId: g.id,
                          rating: Number(e.target.value),
                        }),
                      )
                    }
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Rate 1–5</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <input
                    defaultValue={g.manager_comment ?? ""}
                    disabled={pending}
                    placeholder="Comment"
                    onBlur={(e) => {
                      if (e.target.value !== (g.manager_comment ?? ""))
                        run(() =>
                          setManagerRating({
                            appraisalId: a.id,
                            goalId: g.id,
                            comment: e.target.value,
                          }),
                        );
                    }}
                    className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {a.employee_summary && (
        <p className="mt-2 text-sm">
          <span className="font-medium">Self-assessment: </span>
          {a.employee_summary}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {canReview && c.showGoalReview && (
        <GoalReview appraisal={a} pending={pending} canDecide={c.canDecideGoals} run={run} />
      )}

      {/* What the report posted between reviews. A manager reviewing somebody
          saw only what they typed into the review box; the updates and the
          recognition sat on a page the appraisal never read. */}
      {activity && (
        <div className="mt-3">
          <ActivityRecap
            activity={activity}
            goals={a.goals.map((g) => ({ id: g.id, title: g.title }))}
            heading={`${a.employee_name ?? "They"} posted this cycle`}
          />
        </div>
      )}

      {/* The manager's comment belongs under the objectives it is about, and it
          stays there once the review is done, so it can be read back. */}
      {canReview && c.showMidYear && (
        <ManagerReviewComment
          appraisal={a}
          pending={pending}
          canComplete={c.canCompleteMidYear}
          run={run}
        />
      )}

      {/* On a stage with no box of its own, still somewhere to write. */}
      {canReview && c.needsPlainComment && (
        <ManagerReviewComment appraisal={a} pending={pending} canComplete={false} run={run} />
      )}

      {evaluating && a.competencies.length > 0 && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Competencies
          </h4>
          {a.competencies.map((comp) => (
            <div key={comp.competency_id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-[140px] text-sm">
                {comp.name}
                {comp.employee_rating != null ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (self {comp.employee_rating})
                  </span>
                ) : null}
              </span>
              <select
                defaultValue={comp.manager_rating ?? ""}
                disabled={pending}
                onChange={(e) =>
                  run(() =>
                    rateCompetencyManager({
                      appraisalId: a.id,
                      competencyId: comp.competency_id,
                      rating: Number(e.target.value),
                    }),
                  )
                }
                className="rounded-md border bg-background px-2 py-1 text-xs"
              >
                <option value="">Rate 1–5</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <input
                defaultValue={comp.manager_comment ?? ""}
                disabled={pending}
                placeholder="Comment"
                onBlur={(e) => {
                  if (e.target.value !== (comp.manager_comment ?? ""))
                    run(() =>
                      rateCompetencyManager({
                        appraisalId: a.id,
                        competencyId: comp.competency_id,
                        comment: e.target.value,
                      }),
                    );
                }}
                className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
              />
            </div>
          ))}
        </div>
      )}

      {evaluating && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={pending}
            placeholder="Overall evaluation: strengths, development areas, concerns…"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            rows={2}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => submitManagerEvaluation({ appraisalId: a.id, summary }))}
            >
              <Send className="h-4 w-4" /> Submit evaluation
            </Button>
          </div>
        </div>
      )}

      {canReview && c.readyForDiscussion && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Record the final discussion meeting; the employee then acknowledges.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={discDate}
              onChange={(e) => setDiscDate(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
            <input
              value={discNotes}
              onChange={(e) => setDiscNotes(e.target.value)}
              placeholder="Discussion notes / outcome"
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            />
            <Button
              size="sm"
              disabled={pending || !discDate}
              onClick={() =>
                run(() => recordDiscussion({ appraisalId: a.id, date: discDate, notes: discNotes }))
              }
            >
              <Check className="h-4 w-4" /> Record discussion
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The line manager's verdict on a report's goals, under the goals themselves.
 *
 * The box is open by default and the decisions read as what they mean rather
 * than as verbs. Approving and sending back both carry the comment onto the
 * appraisal, which is where the employee reads it.
 */
function GoalReview({
  appraisal: a,
  pending,
  canDecide,
  run,
}: {
  appraisal: Appraisal;
  pending: boolean;
  /** Only true while the goals actually sit with this manager. */
  canDecide: boolean;
  run: Run;
}) {
  const stored = a.manager_summary ?? "";
  const [text, setText] = useState(stored);
  const [saved, setSaved] = useState(false);
  const changed = text.trim() !== stored.trim();

  return (
    <div className="mt-3 border-t pt-3">
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Line manager comments
      </label>
      <textarea
        value={text}
        disabled={pending}
        rows={3}
        placeholder="Your remarks on these objectives…"
        onChange={(e) => {
          setSaved(false);
          setText(e.target.value);
        }}
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      <p className="mt-1 text-xs text-muted-foreground">
        {a.employee_name ?? "The employee"} sees this on their own appraisal.
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={pending || !canDecide}
          title={canDecide ? undefined : "These goals are not awaiting your review."}
          onClick={() => run(() => approveGoals({ appraisalId: a.id, comment: text }))}
        >
          <Check className="h-4 w-4" /> OK for me
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending || !canDecide || !text.trim()}
          title={
            !canDecide
              ? "These goals are not awaiting your review."
              : !text.trim()
                ? "Say what needs changing first."
                : undefined
          }
          onClick={() => run(() => returnGoals({ appraisalId: a.id, comment: text }))}
        >
          <Undo2 className="h-4 w-4" /> Modify according to my remarks
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending || !changed}
          onClick={() =>
            run(() => setManagerComment({ appraisalId: a.id, comment: text }), () => setSaved(true))
          }
        >
          Save
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending || !changed}
          onClick={() => {
            setText(stored);
            setSaved(false);
          }}
        >
          Cancel
        </Button>
        {saved && !changed && <span className="text-xs text-emerald-700">Saved.</span>}
      </div>

      {!canDecide && (
        <p className="mt-2 text-xs text-muted-foreground">
          The decisions are available once the employee submits these goals for your review. You
          can leave a comment now either way.
        </p>
      )}
    </div>
  );
}

/**
 * The line manager's comment, under the objectives it is about.
 *
 * A proper text area that saves on its own and stays put once the review is
 * done, so the remark can be read back, corrected, and seen afterwards.
 */
function ManagerReviewComment({
  appraisal: a,
  pending,
  canComplete,
  run,
}: {
  appraisal: Appraisal;
  pending: boolean;
  /** True only while the mid-year review is still this manager's to complete. */
  canComplete: boolean;
  run: Run;
}) {
  const stored = a.manager_summary ?? "";
  const [text, setText] = useState(stored);
  const [saved, setSaved] = useState(false);
  const changed = text.trim() !== stored.trim();

  return (
    <div className="mt-3 border-t pt-3">
      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Line manager comments
      </label>
      <textarea
        value={text}
        disabled={pending}
        rows={3}
        placeholder="Your remarks on this half-year…"
        onChange={(e) => {
          setSaved(false);
          setText(e.target.value);
        }}
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      <p className="mt-1 text-xs text-muted-foreground">
        {a.employee_name ?? "The employee"} sees this on their own appraisal.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {canComplete && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => completeMidYear({ appraisalId: a.id, comment: text }))}
          >
            <Check className="h-4 w-4" /> Complete mid-year review
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !changed}
          onClick={() =>
            run(() => setManagerComment({ appraisalId: a.id, comment: text }), () => setSaved(true))
          }
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || !changed}
          onClick={() => {
            setText(stored);
            setSaved(false);
          }}
        >
          Cancel
        </Button>
        {saved && !changed && <span className="text-xs text-emerald-700">Saved.</span>}
      </div>
    </div>
  );
}
