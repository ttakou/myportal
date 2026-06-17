"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ISSUE_LABEL,
  INCIDENT_TYPES,
  type Feedback,
  type IssueType,
} from "@/types/feedback";
import { resolveFeedback, submitFeedback } from "../actions";

const ISSUE_OPTIONS: IssueType[] = [
  "none",
  "hygiene",
  "late_service",
  "wrong_meal",
  "allergy",
  "suggestion",
];

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} stars`}>
          <Star className={cn("h-6 w-6", n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
        </button>
      ))}
    </div>
  );
}

function StarsRO({ value }: { value: number | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("h-3.5 w-3.5", n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
      ))}
    </span>
  );
}

export function FeedbackBoard({
  mine,
  all,
  isAdmin,
}: {
  mine: Feedback[];
  all: Feedback[];
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useStatusTransition("Submitting…");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState(false);

  const [food, setFood] = useState(0);
  const [qty, setQty] = useState(0);
  const [issue, setIssue] = useState<IssueType>("none");
  const [comment, setComment] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    setOkMsg(false);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed.");
      else onOk?.();
    });
  }

  return (
    <div className="space-y-8">
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      {okMsg && <p className="rounded-md bg-green-100 px-4 py-2 text-sm text-green-700">Thanks for your feedback!</p>}

      {/* Submit form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => submitFeedback({ foodQuality: food || null, quantityRating: qty || null, issueType: issue, comment }),
            () => { setFood(0); setQty(0); setIssue("none"); setComment(""); setOkMsg(true); },
          );
        }}
        className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2"
      >
        <div>
          <p className="mb-1 text-sm font-medium">Food quality</p>
          <Stars value={food} onChange={setFood} />
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Quantity</p>
          <Stars value={qty} onChange={setQty} />
        </div>
        <label className="text-sm sm:col-span-1">
          Issue type
          <select value={issue} onChange={(e) => setIssue(e.target.value as IssueType)} className="mt-1 block w-full rounded-md border bg-background px-2 py-2 text-sm">
            {ISSUE_OPTIONS.map((i) => <option key={i} value={i}>{ISSUE_LABEL[i]}</option>)}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          Comment
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Tell us more…" className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>Submit feedback</Button>
        </div>
      </form>

      {/* My feedback */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">My feedback</h2>
        <FeedbackList items={mine} showPerson={false} isAdmin={false} pending={pending} run={run} />
      </section>

      {/* Admin inbox */}
      {isAdmin && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">All feedback &amp; incidents</h2>
          <FeedbackList items={all} showPerson isAdmin pending={pending} run={run} />
        </section>
      )}
    </div>
  );
}

function FeedbackList({
  items,
  showPerson,
  isAdmin,
  pending,
  run,
}: {
  items: Feedback[];
  showPerson: boolean;
  isAdmin: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <div className="space-y-2">
      {items.map((f) => {
        const isIncident = INCIDENT_TYPES.includes(f.issue_type);
        return (
          <div key={f.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {showPerson && <span className="font-medium">{f.person_name ?? "—"}</span>}
                <span className="text-muted-foreground">{f.service_date}</span>
                {f.issue_type !== "none" && (
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", isIncident ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground")}>
                    {ISSUE_LABEL[f.issue_type]}
                  </span>
                )}
                {isIncident && (
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", f.status === "resolved" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                    {f.status}
                  </span>
                )}
              </div>
              {isAdmin && isIncident && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => resolveFeedback(f.id, f.status !== "resolved"))}>
                  {f.status === "resolved" ? "Reopen" : "Resolve"}
                </Button>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">Food <StarsRO value={f.food_quality} /></span>
              <span className="inline-flex items-center gap-1">Quantity <StarsRO value={f.quantity_rating} /></span>
            </div>
            {f.comment && <p className="mt-1 text-sm">{f.comment}</p>}
          </div>
        );
      })}
    </div>
  );
}
