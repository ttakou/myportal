import { Award, MessageSquare } from "lucide-react";
import { byGoal, unlinked, type PersonActivity } from "@/lib/performance/goal-activity";

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "UTC" });
}

/**
 * What somebody posted between reviews, at the review.
 *
 * Goal updates and recognition were written on the Continuous page and read
 * nowhere else — so a person retyped at mid-year what they had already written
 * in June, and their manager reviewed them without seeing any of it. The record
 * of the year was on a screen nobody opens during the year's review.
 */
export function ActivityRecap({
  activity,
  goals,
  heading = "Since the last review",
}: {
  activity: PersonActivity;
  /** Titles for the goals updates name, so a row reads as more than an id. */
  goals: { id: string; title: string }[];
  heading?: string;
}) {
  const linked = byGoal(activity.updates);
  const loose = unlinked(activity.updates);
  const titles = new Map(goals.map((g) => [g.id, g.title]));

  if (activity.updates.length === 0 && activity.recognition.length === 0) return null;

  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">{heading}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Posted on Continuous during the cycle. Shown here so the review starts from what actually
        happened rather than from memory.
      </p>

      {activity.updates.length > 0 && (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" /> Goal updates ({activity.updates.length})
          </p>
          <ul className="mt-1.5 space-y-2">
            {[...linked.entries()].map(([goalId, items]) => (
              <li key={goalId} className="rounded-md border bg-background p-2.5">
                <p className="text-sm font-medium">{titles.get(goalId) ?? "An objective"}</p>
                <ul className="mt-1 space-y-1">
                  {items.map((u) => (
                    <li key={u.id} className="text-xs">
                      <span className="text-muted-foreground">{when(u.createdAt)}</span>
                      {u.title ? <span className="ml-1.5 font-medium">{u.title}</span> : null}
                      {u.body && <p className="whitespace-pre-wrap text-muted-foreground">{u.body}</p>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {loose.length > 0 && (
              <li className="rounded-md border border-dashed bg-background p-2.5">
                {/* Updates posted before the objective picker existed, and any
                    the author chose not to tie to one. Still the record of what
                    they did, so they are listed rather than dropped. */}
                <p className="text-sm font-medium text-muted-foreground">Not tied to an objective</p>
                <ul className="mt-1 space-y-1">
                  {loose.map((u) => (
                    <li key={u.id} className="text-xs">
                      <span className="text-muted-foreground">{when(u.createdAt)}</span>
                      {u.title ? <span className="ml-1.5 font-medium">{u.title}</span> : null}
                      {u.body && <p className="whitespace-pre-wrap text-muted-foreground">{u.body}</p>}
                    </li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        </div>
      )}

      {activity.recognition.length > 0 && (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Award className="h-3.5 w-3.5" /> Recognition from colleagues (
            {activity.recognition.length})
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {activity.recognition.map((r) => (
              <li key={r.id} className="rounded-md border bg-background p-2.5 text-xs">
                <p>
                  <span className="font-medium">{r.authorName ?? "A colleague"}</span>
                  <span className="ml-2 text-muted-foreground">{when(r.createdAt)}</span>
                </p>
                {r.title && <p className="mt-0.5 font-medium">{r.title}</p>}
                {r.body && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{r.body}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
