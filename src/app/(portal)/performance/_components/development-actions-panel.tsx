"use client";

import { useState } from "react";
import { Plus, Trash2, CheckCircle2, Circle, CalendarDays } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ContinuousActivity } from "@/types/continuous";
import { createActivity, deleteActivity, updateActivityStatus } from "../continuous-activity-actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

export function DevelopmentActionsPanel({
  items,
  myId,
}: {
  items: ContinuousActivity[];
  myId: string;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    if (!title.trim()) {
      setError("Give the action a title.");
      return;
    }
    startTransition(async () => {
      const res = await createActivity({
        kind: "development_action",
        subjectId: myId,
        title,
        body,
        status: "open",
        dueDate: due || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Couldn't save.");
        return;
      }
      setTitle("");
      setBody("");
      setDue("");
    });
  }

  function toggle(a: ContinuousActivity) {
    startTransition(async () => {
      await updateActivityStatus(a.id, a.status === "done" ? "open" : "done");
    });
  }
  function remove(id: string) {
    startTransition(async () => {
      await deleteActivity(id);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Development action" className={cn(field, "min-w-[12rem] flex-1 py-1.5")} />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cn(field, "py-1.5")} aria-label="Due date" />
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What's involved / success looks like…" rows={2} className={cn(field, "block w-full")} />
        <div className="flex justify-end">
          <Button size="sm" disabled={pending} onClick={add}>
            <Plus className="h-4 w-4" /> Add action
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
              <button type="button" onClick={() => toggle(a)} disabled={pending} className="mt-0.5 shrink-0" aria-label="Toggle done">
                {a.status === "done" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", a.status === "done" && "text-muted-foreground line-through")}>{a.title}</p>
                {a.body && <p className="text-sm text-muted-foreground">{a.body}</p>}
                {a.dueDate && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" /> due {a.dueDate}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(a.id)} aria-label="Delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
