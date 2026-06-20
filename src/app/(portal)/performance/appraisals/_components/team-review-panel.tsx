"use client";

import Link from "next/link";
import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Check, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STAGE_LABEL, STATUS_LABEL, type Appraisal } from "@/types/appraisal";
import {
  approveGoals,
  completeMidYear,
  rateCompetencyManager,
  recordDiscussion,
  returnGoals,
  setManagerRating,
  submitManagerEvaluation,
} from "../actions";

export function TeamReviewPanel({ appraisals }: { appraisals: Appraisal[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">My team&apos;s appraisals</h2>
      <div className="space-y-3">
        {appraisals.map((a) => (
          <TeamRow key={a.id} appraisal={a} />
        ))}
      </div>
    </section>
  );
}

function TeamRow({ appraisal: a }: { appraisal: Appraisal }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState("");
  const [summary, setSummary] = useState(a.manager_summary ?? "");
  const [discDate, setDiscDate] = useState("");
  const [discNotes, setDiscNotes] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  const awaitingGoalReview = a.stage === "goal_setting" && a.status === "pending_manager_review";
  const awaitingMidYear = a.stage === "goal_review" && a.status === "pending_manager_review";
  const evaluating = a.stage === "manager_review";

  return (
    <div id={`appraisal-${a.id}`} className="scroll-mt-24 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{a.employee_name || "—"}</div>
        <div className="flex items-center gap-2">
          {(a.status === "completed" || a.status === "closed") && (
            <Link
              href={`/performance/appraisals/${a.id}/outcome`}
              className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent"
            >
              Outcome
            </Link>
          )}
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {STAGE_LABEL[a.stage]} · {STATUS_LABEL[a.status]}
            {a.final_score != null ? ` · ${a.final_score}% · ${a.rating_label ?? ""}` : ""}
          </span>
        </div>
      </div>

      {/* Goals + progress + ratings */}
      {a.goals.length > 0 && (
        <ul className="mt-2 divide-y text-sm">
          {a.goals.map((g) => (
            <li key={g.id} className="py-1.5">
              <div className="flex justify-between gap-3">
                <span>
                  {g.title}
                  {g.at_risk ? <span className="ml-1 text-xs text-amber-700">(at risk)</span> : ""}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {g.weight}%
                  {g.employee_self_rating != null ? ` · self ${g.employee_self_rating}` : ""}
                </span>
              </div>
              {(g.employee_progress || g.employee_comment) && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {g.employee_progress || g.employee_comment}
                </p>
              )}
              {g.raters.length > 0 && (
                <div className="mt-1 rounded-md bg-muted/50 px-2 py-1 text-xs">
                  <span className="font-medium">Stakeholder feedback</span>
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
                      run(() => setManagerRating({ appraisalId: a.id, goalId: g.id, rating: Number(e.target.value) }))
                    }
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Rate 1–5</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <input
                    defaultValue={g.manager_comment ?? ""}
                    disabled={pending}
                    placeholder="Comment"
                    onBlur={(e) => {
                      if (e.target.value !== (g.manager_comment ?? ""))
                        run(() => setManagerRating({ appraisalId: a.id, goalId: g.id, comment: e.target.value }));
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
        <p className="mt-2 text-sm"><span className="font-medium">Self-assessment: </span>{a.employee_summary}</p>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {/* Stage actions */}
      {awaitingGoalReview && (
        <ReviewButtons
          pending={pending}
          returning={returning}
          comment={comment}
          setReturning={setReturning}
          setComment={setComment}
          onApprove={() => run(() => approveGoals({ appraisalId: a.id }))}
          onReturn={() => run(() => returnGoals({ appraisalId: a.id, comment }), () => setReturning(false))}
          approveLabel="Approve goals"
        />
      )}

      {awaitingMidYear && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Review comment (optional)"
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          />
          <Button size="sm" disabled={pending} onClick={() => run(() => completeMidYear({ appraisalId: a.id, comment }))}>
            <Check className="h-4 w-4" /> Complete mid-year review
          </Button>
        </div>
      )}

      {evaluating && a.competencies.length > 0 && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Competencies
          </h4>
          {a.competencies.map((c) => (
            <div key={c.competency_id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-[140px] text-sm">
                {c.name}
                {c.employee_rating != null ? (
                  <span className="ml-1 text-xs text-muted-foreground">(self {c.employee_rating})</span>
                ) : null}
              </span>
              <select
                defaultValue={c.manager_rating ?? ""}
                disabled={pending}
                onChange={(e) =>
                  run(() => rateCompetencyManager({ appraisalId: a.id, competencyId: c.competency_id, rating: Number(e.target.value) }))
                }
                className="rounded-md border bg-background px-2 py-1 text-xs"
              >
                <option value="">Rate 1–5</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <input
                defaultValue={c.manager_comment ?? ""}
                disabled={pending}
                placeholder="Comment"
                onBlur={(e) => {
                  if (e.target.value !== (c.manager_comment ?? ""))
                    run(() => rateCompetencyManager({ appraisalId: a.id, competencyId: c.competency_id, comment: e.target.value }));
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
            <Button size="sm" disabled={pending} onClick={() => run(() => submitManagerEvaluation({ appraisalId: a.id, summary }))}>
              <Send className="h-4 w-4" /> Submit evaluation
            </Button>
          </div>
        </div>
      )}

      {a.stage === "final_discussion" && a.status === "ready_for_final_discussion" && (
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
              onClick={() => run(() => recordDiscussion({ appraisalId: a.id, date: discDate, notes: discNotes }))}
            >
              <Check className="h-4 w-4" /> Record discussion
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewButtons({
  pending,
  returning,
  comment,
  setReturning,
  setComment,
  onApprove,
  onReturn,
  approveLabel,
}: {
  pending: boolean;
  returning: boolean;
  comment: string;
  setReturning: (v: boolean) => void;
  setComment: (v: string) => void;
  onApprove: () => void;
  onReturn: () => void;
  approveLabel: string;
}) {
  return (
    <div className="mt-3 border-t pt-3">
      {returning ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What needs changing?"
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          />
          <Button variant="outline" size="sm" disabled={pending || !comment.trim()} onClick={onReturn}>
            Send back
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setReturning(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setReturning(true)}>
            <Undo2 className="h-4 w-4" /> Return
          </Button>
          <Button size="sm" disabled={pending} onClick={onApprove}>
            <Check className="h-4 w-4" /> {approveLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
