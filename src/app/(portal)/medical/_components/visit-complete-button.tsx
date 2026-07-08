"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStatusTransition } from "@/components/activity";
import { setMedicalVisitComplete } from "../actions";

/** Toggle a scheduled visit complete/incomplete (employee on own, or admin). */
export function VisitCompleteButton({
  scheduleId,
  visit,
  completedAt,
}: {
  scheduleId: string;
  visit: 1 | 2;
  completedAt: string | null;
}) {
  const [pending, start] = useStatusTransition("Saving…");
  const [done, setDone] = useState(Boolean(completedAt));
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !done;
    setError(null);
    setDone(next); // optimistic
    start(async () => {
      const res = await setMedicalVisitComplete(scheduleId, visit, next);
      if (!res.ok) {
        setDone(!next); // revert
        setError(res.error ?? "Could not update.");
      }
    });
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={done}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
          done
            ? "border-green-300 bg-green-100 text-green-800 hover:bg-green-200"
            : "bg-background text-muted-foreground hover:bg-accent",
        )}
        title={done ? "Marked completed — click to undo" : "Mark this visit completed"}
      >
        <Check className={cn("h-3.5 w-3.5", done ? "opacity-100" : "opacity-40")} />
        {done ? "Completed" : "Mark completed"}
      </button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </span>
  );
}
