"use client";

import { useState } from "react";
import { Check, CircleDot, Circle, CornerUpLeft, X, ArrowRight, UserCog } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { GoalWeight } from "./goal-weight";
import { cn } from "@/lib/utils";
import type { StageAction } from "@/lib/workflow-engine";
import { advanceAppraisalStage } from "../workflow-actions";

export type Step = { key: string; label: string; responsible: string; status: "done" | "active" | "upcoming" };
export type ReviewGoal = {
  id: string;
  title: string;
  description: string | null;
  weight: number | null;
  deadline: string | null;
  successIndicator: string | null;
  selfRating: number | null;
  employeeProgress: string | null;
};

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
  proxyFor,
  completed,
  rejected,
  goals = [],
  showGoals = false,
}: {
  appraisalId: string;
  heading?: string;
  steps: Step[];
  actionable: Actionable[];
  /** The goals the live step is about, when it is about goals. */
  goals?: ReviewGoal[];
  showGoals?: boolean;
  waitingOn: string[];
  progress: number;
  /** True when at least one of the buttons below acts for somebody else. */
  isProxy?: boolean;
  /** Whose appraisal this is, when the caller knows it — names the warning. */
  proxyFor?: string | null;
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

      {/* The step under way is about the goals, so they belong here rather than
          on another panel the reviewer has to go and find. */}
      {showGoals && !completed && !rejected && (
        <div className="border-t pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Objectives under review ({goals.length})
          </h3>
          {goals.length === 0 ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No goals have been entered on this appraisal, so there is nothing to review yet. The
              employee sets them at the goal-setting step; hand it back to them with Return.
            </p>
          ) : (
            <ul className="space-y-2">
              {goals.map((g) => (
                <li key={g.id} className="rounded-md border bg-background p-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-medium">{g.title}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {g.selfRating != null && (
                        <span className="text-xs text-muted-foreground">self {g.selfRating}</span>
                      )}
                      <GoalWeight weight={g.weight} />
                    </span>
                  </div>
                  {g.description && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {g.description}
                    </p>
                  )}
                  {(g.successIndicator || g.deadline) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[g.deadline ? `due ${g.deadline}` : null, g.successIndicator]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  {g.employeeProgress && (
                    <p className="mt-1 whitespace-pre-wrap rounded bg-muted/50 px-2 py-1 text-xs">
                      {g.employeeProgress}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!completed && !rejected && (
        <div className="space-y-2 border-t pt-3">
          {isProxy && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <UserCog className="mt-0.5 h-4 w-4 shrink-0" />
              {proxyFor ? (
                <span>
                  You are standing in on <strong className="font-semibold">{proxyFor}</strong>&apos;s
                  appraisal. Each button below says whose step it takes, and your name and theirs are
                  both recorded against it.
                </span>
              ) : (
                <span>
                  You are acting for someone else. Your name and theirs are both recorded against
                  anything you do here.
                </span>
              )}
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
