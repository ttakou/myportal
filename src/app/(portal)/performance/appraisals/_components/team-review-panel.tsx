"use client";

import { useState, useTransition } from "react";
import { Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, type Appraisal } from "@/types/appraisal";
import { approveGoals, returnGoals } from "../actions";

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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState("");

  const pendingReview = a.status === "pending_manager_review";
  const totalWeight = a.goals.reduce((s, g) => s + (g.weight ?? 0), 0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{a.employee_name || "—"}</div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {STATUS_LABEL[a.status]}
        </span>
      </div>

      {a.goals.length > 0 && (
        <ul className="mt-2 divide-y text-sm">
          {a.goals.map((g) => (
            <li key={g.id} className="flex justify-between gap-3 py-1.5">
              <span>{g.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {g.weight}%{g.deadline ? ` · ${g.deadline}` : ""}
              </span>
            </li>
          ))}
          <li className="flex justify-between py-1.5 text-xs text-muted-foreground">
            <span>Total weight</span>
            <span className={totalWeight === 100 ? "text-green-600" : ""}>{totalWeight}%</span>
          </li>
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {pendingReview && (
        <div className="mt-3 border-t pt-3">
          {returning ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What needs changing?"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={pending || !comment.trim()}
                onClick={() =>
                  run(() => returnGoals({ appraisalId: a.id, comment }), () => setReturning(false))
                }
              >
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
              <Button size="sm" disabled={pending} onClick={() => run(() => approveGoals({ appraisalId: a.id }))}>
                <Check className="h-4 w-4" /> Approve goals
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
