"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RaterAssignment } from "@/types/appraisal";
import { submitGoalRating } from "../actions";

export function RaterInbox({ assignments }: { assignments: RaterAssignment[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Performance feedback requested from you</h2>
        <p className="text-sm text-muted-foreground">
          Rate each colleague&apos;s performance on the objective below. Your response is shared
          with their line manager only — not with the colleague.
        </p>
      </div>
      <div className="space-y-3">
        {assignments.map((a) => (
          <AssignmentRow key={a.id} assignment={a} />
        ))}
      </div>
    </section>
  );
}

function AssignmentRow({ assignment: a }: { assignment: RaterAssignment }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState<string>(a.rating != null ? String(a.rating) : "");
  const [comment, setComment] = useState(a.comment ?? "");

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitGoalRating({
        assignmentId: a.id,
        rating: Number(rating),
        comment,
      });
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{a.goal_title}</div>
          <div className="text-xs text-muted-foreground">
            {a.employee_name ?? "—"}
            {a.cycle_name ? ` · ${a.cycle_name}` : ""}
          </div>
        </div>
        {a.status === "submitted" && (
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
            Submitted
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={rating}
          disabled={pending}
          onChange={(e) => setRating(e.target.value)}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="">Rate 1–5</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={pending}
          placeholder="Comment (optional)"
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <Button size="sm" disabled={pending || !rating} onClick={submit}>
          <Send className="h-4 w-4" /> {a.status === "submitted" ? "Update" : "Submit"}
        </Button>
      </div>
    </div>
  );
}
