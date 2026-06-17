"use client";

import { useState, useTransition } from "react";
import { Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Appraisal } from "@/types/appraisal";
import { secondLevelApprove, secondLevelReturn } from "../actions";

export function SecondLevelPanel({ appraisals }: { appraisals: Appraisal[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Second-level approvals</h2>
      <p className="text-sm text-muted-foreground">
        Appraisals from your managers&apos; teams awaiting your sign-off.
      </p>
      <div className="space-y-3">
        {appraisals.map((a) => (
          <Row key={a.id} a={a} />
        ))}
      </div>
    </section>
  );
}

function Row({ a }: { a: Appraisal }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          <span className="font-medium">{a.employee_name || "—"}</span>
          {a.manager_name ? <span className="text-muted-foreground"> · mgr {a.manager_name}</span> : null}
          {a.final_score != null ? (
            <span className="ml-2 text-xs text-muted-foreground">{a.final_score}% · {a.rating_label}</span>
          ) : null}
        </span>
      </div>
      {a.goals.length > 0 && (
        <ul className="mt-2 divide-y text-sm">
          {a.goals.map((g) => (
            <li key={g.id} className="flex justify-between gap-3 py-1">
              <span>{g.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {g.weight}%{g.manager_rating != null ? ` · mgr ${g.manager_rating}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {a.manager_summary && (
        <p className="mt-2 text-sm"><span className="font-medium">Manager summary: </span>{a.manager_summary}</p>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-3 border-t pt-3">
        {returning ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What needs correcting?"
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={pending || !comment.trim()}
              onClick={() => run(() => secondLevelReturn({ appraisalId: a.id, comment }))}
            >
              Send to manager
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
            <Button size="sm" disabled={pending} onClick={() => run(() => secondLevelApprove(a.id))}>
              <Check className="h-4 w-4" /> Approve
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
