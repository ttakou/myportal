"use client";

import { useState } from "react";
import { Check, CircleDot, Circle, CornerUpLeft, X, ArrowRight } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StageAction } from "@/lib/workflow-engine";
import { advanceAppraisalStage } from "../workflow-actions";

type Step = { key: string; label: string; responsible: string };

export function WorkflowTimeline({
  appraisalId,
  heading,
  steps,
  currentKey,
  progress,
  completed,
  rejected,
  canActNow,
  primaryAction,
  primaryLabel,
  allowReturn,
  allowReject,
  currentResponsible,
}: {
  appraisalId: string;
  heading?: string;
  steps: Step[];
  currentKey: string;
  progress: number;
  completed: boolean;
  rejected: boolean;
  canActNow: boolean;
  primaryAction: StageAction;
  primaryLabel: string;
  allowReturn: boolean;
  allowReject: boolean;
  currentResponsible: string | null;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  const currentIndex = steps.findIndex((s) => s.key === currentKey);

  function act(action: StageAction) {
    setError(null);
    startTransition(async () => {
      const res = await advanceAppraisalStage(appraisalId, action);
      if (!res.ok) setError(res.error ?? "Couldn't update the stage.");
    });
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{heading ?? "Workflow"}</h2>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium",
            rejected
              ? "bg-destructive/10 text-destructive"
              : completed
                ? "bg-green-100 text-green-700"
                : "bg-primary/10 text-primary",
          )}
        >
          {rejected ? "Rejected" : completed ? "Completed" : `${progress}% complete`}
        </span>
      </div>

      <ol className="space-y-2">
        {steps.map((s, i) => {
          const done = completed || (currentIndex >= 0 && i < currentIndex);
          const isCurrent = !completed && !rejected && i === currentIndex;
          return (
            <li key={s.key} className="flex items-start gap-3">
              <span className="mt-0.5">
                {done ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : isCurrent ? (
                  <CircleDot className="h-4 w-4 text-primary" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
              <div>
                <p className={cn("text-sm", isCurrent ? "font-medium" : done ? "text-muted-foreground" : "")}>
                  {s.label}
                </p>
                <p className="text-xs text-muted-foreground">{s.responsible}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {!completed && !rejected && (
        <div className="border-t pt-3">
          {canActNow ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={pending} onClick={() => act(primaryAction)}>
                <ArrowRight className="h-4 w-4" /> {primaryLabel}
              </Button>
              {allowReturn && (
                <Button variant="outline" disabled={pending} onClick={() => act("return")}>
                  <CornerUpLeft className="h-4 w-4" /> Return for correction
                </Button>
              )}
              {allowReject && (
                <Button variant="outline" disabled={pending} onClick={() => act("reject")}>
                  <X className="h-4 w-4" /> Reject
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Waiting on {currentResponsible ?? "the next reviewer"}.
            </p>
          )}
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      )}
    </section>
  );
}
