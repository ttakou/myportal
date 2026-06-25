"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EvaluableSession } from "@/types/training";
import { submitSelfEvaluation } from "../actions";

const field = "rounded-md border bg-background px-2 py-1 text-sm";

function fmtDate(d: string | null) {
  return d ? new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export function MyEvaluationsPanel({ sessions }: { sessions: EvaluableSession[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [score, setScore] = useState("");
  const [comments, setComments] = useState("");

  function submit(sessionId: string) {
    setError(null);
    startTransition(async () => {
      const res = await submitSelfEvaluation({
        sessionId,
        kind: "reaction",
        score: score ? Number(score) : null,
        comments,
      });
      if (!res.ok) setError(res.error ?? "Failed.");
      else {
        setOpenId(null);
        setScore("");
        setComments("");
      }
    });
  }

  const pendingCount = sessions.filter((s) => !s.evaluated).length;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Star className="h-5 w-5 text-primary" /> Training Evaluations
        </h2>
        <p className="text-sm text-muted-foreground">
          {pendingCount} session(s) awaiting your feedback. Tell us how your training went.
        </p>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {sessions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No completed sessions to evaluate yet.
        </p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.session_id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{s.course_title}</p>
                  <p className="text-xs text-muted-foreground">Completed {fmtDate(s.ended_on)}</p>
                </div>
                {s.evaluated ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Submitted</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setOpenId(openId === s.session_id ? null : s.session_id)}>
                    {openId === s.session_id ? "Close" : "Evaluate"}
                  </Button>
                )}
              </div>
              {openId === s.session_id && !s.evaluated && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-muted-foreground">
                    Overall rating
                    <select value={score} onChange={(e) => setScore(e.target.value)} className={cn(field, "mt-0.5 block w-full")}>
                      <option value="">— rate 1–5 —</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} {"★".repeat(n)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground sm:col-span-2">
                    Comments
                    <textarea
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      rows={2}
                      className={cn(field, "mt-0.5 block w-full")}
                    />
                  </label>
                  <div>
                    <Button size="sm" disabled={pending || !score} onClick={() => submit(s.session_id)}>
                      Submit evaluation
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
