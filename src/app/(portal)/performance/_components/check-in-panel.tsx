"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CheckInQuestion, ContinuousActivity } from "@/types/continuous";
import { createActivity } from "../continuous-activity-actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

type Response = { label: string; value: string };

export function CheckInPanel({
  questions,
  frequencyLabel,
  items,
  myId,
}: {
  questions: CheckInQuestion[];
  frequencyLabel: string;
  items: ContinuousActivity[];
  myId: string;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [pending, startTransition] = useStatusTransition("Posting…");
  const [error, setError] = useState<string | null>(null);

  const setAnswer = (id: string, v: string) => setAnswers((a) => ({ ...a, [id]: v }));

  function submit() {
    setError(null);
    const missing = questions.find((q) => q.required && !(answers[q.id] ?? "").trim());
    if (missing) {
      setError(`"${missing.label}" is required.`);
      return;
    }
    const responses: Response[] =
      questions.length > 0
        ? questions.map((q) => ({ label: q.label, value: (answers[q.id] ?? "").trim() }))
        : [{ label: "Notes", value: note.trim() }];
    if (responses.every((r) => !r.value)) {
      setError("Add at least one answer.");
      return;
    }
    startTransition(async () => {
      const res = await createActivity({
        kind: "check_in",
        subjectId: myId,
        body: questions.length === 0 ? note.trim() : null,
        data: { responses },
      });
      if (!res.ok) {
        setError(res.error ?? "Couldn't post.");
        return;
      }
      setAnswers({});
      setNote("");
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <p className="text-xs text-muted-foreground">Cadence: {frequencyLabel}</p>
        {questions.length > 0 ? (
          questions.map((q) => (
            <label key={q.id} className="block text-sm">
              <span className="text-muted-foreground">
                {q.label}
                {q.required && <span className="text-destructive"> *</span>}
              </span>
              <textarea
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                rows={2}
                className={cn(field, "mt-0.5 block w-full")}
              />
            </label>
          ))
        ) : (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How are things going?"
            rows={3}
            className={cn(field, "block w-full")}
          />
        )}
        <div className="flex justify-end">
          <Button size="sm" disabled={pending} onClick={submit}>
            <Send className="h-4 w-4" /> Submit check-in
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((a) => {
            const responses = Array.isArray(a.data.responses) ? (a.data.responses as Response[]) : [];
            return (
              <li key={a.id} className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">
                  {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ""}
                </p>
                {responses.length > 0 ? (
                  <dl className="mt-1 space-y-1">
                    {responses
                      .filter((r) => r.value)
                      .map((r, i) => (
                        <div key={i}>
                          <dt className="text-xs font-medium text-muted-foreground">{r.label}</dt>
                          <dd className="text-sm">{r.value}</dd>
                        </div>
                      ))}
                  </dl>
                ) : (
                  a.body && <p className="mt-1 text-sm">{a.body}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
