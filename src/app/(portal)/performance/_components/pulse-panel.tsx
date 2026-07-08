"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ContinuousActivity, PulseQuestion } from "@/types/continuous";
import { createActivity } from "../continuous-activity-actions";

type Response = { label: string; value: number };

export function PulsePanel({
  questions,
  items,
  myId,
}: {
  questions: PulseQuestion[];
  items: ContinuousActivity[];
  myId: string;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [pending, startTransition] = useStatusTransition("Posting…");
  const [error, setError] = useState<string | null>(null);

  if (questions.length === 0) {
    return <p className="text-sm text-muted-foreground">HR hasn&apos;t added any pulse questions yet.</p>;
  }

  function submit() {
    setError(null);
    const responses: Response[] = questions
      .filter((q) => answers[q.id] != null)
      .map((q) => ({ label: q.label, value: answers[q.id] }));
    if (responses.length === 0) {
      setError("Answer at least one question.");
      return;
    }
    startTransition(async () => {
      const res = await createActivity({ kind: "pulse_response", subjectId: myId, data: { responses } });
      if (!res.ok) setError(res.error ?? "Couldn't post.");
      else setAnswers({});
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border bg-card p-4">
        {questions.map((q) => {
          const scale = Math.max(2, Math.min(10, q.scale || 5));
          return (
            <div key={q.id}>
              <p className="text-sm">{q.label}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {Array.from({ length: scale }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: n }))}
                    className={cn(
                      "h-8 w-8 rounded-full border text-sm",
                      answers[q.id] === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div className="flex justify-end">
          <Button size="sm" disabled={pending} onClick={submit}>
            <Send className="h-4 w-4" /> Submit pulse
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.slice(0, 8).map((a) => {
            const responses = Array.isArray(a.data.responses) ? (a.data.responses as Response[]) : [];
            return (
              <li key={a.id} className="rounded-lg border bg-card p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ""}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {responses.map((r, i) => (
                    <span key={i} className="text-xs">
                      {r.label}: <span className="font-medium">{r.value}</span>
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
