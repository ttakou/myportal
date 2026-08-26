"use client";

import { useState } from "react";
import { Check, CircleDot, Circle, CornerUpLeft, X, ArrowRight, UserCog } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StageAction } from "@/lib/workflow-engine";
import { advanceAppraisalStage } from "../workflow-actions";

export type Step = { key: string; label: string; responsible: string; status: "done" | "active" | "upcoming" };
export type Actionable = {
  key: string;
  label: string;
  primaryAction: StageAction;
  primaryLabel: string;
  allowReturn: boolean;
  allowReject: boolean;
  /** Set when this step belongs to somebody else and you are standing in. */
  actingFor: string | null;
};

export function WorkflowTimeline({
  appraisalId,
  heading,
  steps,
  actionable,
  waitingOn,
  progress,
  isProxy,
  completed,
  rejected,
}: {
  appraisalId: string;
  heading?: string;
  steps: Step[];
  actionable: Actionable[];
  waitingOn: string[];
  progress: number;
  /** True when at least one of the buttons below acts for somebody else. */
  isProxy?: boolean;
  completed: boolean;
  rejected: boolean;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function act(stageKey: string, action: StageAction) {
    setError(null);
    startTransition(async () => {
      const res = await advanceAppraisalStage(appraisalId, stageKey, action);
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
            rejected ? "bg-destructive/10 text-destructive" : completed ? "bg-green-100 text-green-700" : "bg-primary/10 text-primary",
          )}
        >
          {rejected ? "Rejected" : completed ? "Completed" : `${progress}% complete`}
        </span>
      </div>

      <ol className="space-y-2">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3">
            <span className="mt-0.5">
              {s.status === "done" ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : s.status === "active" ? (
                <CircleDot className="h-4 w-4 text-primary" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <div>
              <p className={cn("text-sm", s.status === "active" ? "font-medium" : s.status === "done" ? "text-muted-foreground" : "")}>
                {s.label}
              </p>
              <p className="text-xs text-muted-foreground">{s.responsible}</p>
            </div>
          </li>
        ))}
      </ol>

      {!completed && !rejected && (
        <div className="space-y-2 border-t pt-3">
          {isProxy && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <UserCog className="mt-0.5 h-4 w-4 shrink-0" />
              You are acting for someone else. Your name and theirs are both recorded against
              anything you do here.
            </p>
          )}
          {actionable.map((a) => (
            <div key={a.key} className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{a.label}:</span>
              {a.actingFor && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  as {a.actingFor}
                </span>
              )}
              <Button size="sm" disabled={pending} onClick={() => act(a.key, a.primaryAction)}>
                <ArrowRight className="h-4 w-4" /> {a.primaryLabel}
              </Button>
              {a.allowReturn && (
                <Button variant="outline" size="sm" disabled={pending} onClick={() => act(a.key, "return")}>
                  <CornerUpLeft className="h-4 w-4" /> Return
                </Button>
              )}
              {a.allowReject && (
                <Button variant="outline" size="sm" disabled={pending} onClick={() => act(a.key, "reject")}>
                  <X className="h-4 w-4" /> Reject
                </Button>
              )}
            </div>
          ))}
          {actionable.length === 0 && waitingOn.length > 0 && (
            <p className="text-sm text-muted-foreground">Waiting on {waitingOn.join(", ")}.</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </section>
  );
}
