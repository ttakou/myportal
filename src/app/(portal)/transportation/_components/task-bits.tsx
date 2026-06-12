"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  PRIORITY_LABEL,
  TASK_TYPE_LABEL,
  TRANSPORT_STATUS_LABEL,
  type TransportPriority,
  type TransportRequest,
  type TransportStatus,
  type TransportTaskType,
} from "@/types/transport";
import { addTaskFollowUp } from "../actions";

export const STATUS_STYLE: Record<TransportStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  assigned: "bg-accent text-accent-foreground",
  in_progress: "bg-primary/10 text-primary",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-destructive/10 text-destructive line-through",
};

const PRIORITY_STYLE: Record<TransportPriority, string> = {
  normal: "bg-muted text-muted-foreground",
  high: "bg-amber-100 text-amber-700",
  urgent: "bg-destructive/10 text-destructive",
};

export function StatusBadge({ status }: { status: TransportStatus }) {
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLE[status])}>
      {TRANSPORT_STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TransportPriority }) {
  if (priority === "normal") return null;
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", PRIORITY_STYLE[priority])}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function TypeBadge({ type }: { type: TransportTaskType }) {
  return (
    <span className="inline-block rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
      {TASK_TYPE_LABEL[type]}
    </span>
  );
}

export function fmt(dt: string) {
  return new Date(dt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Collapsible follow-up trail plus an "add note" box. */
export function FollowUps({ task, canPost }: { task: TransportRequest; canPost: boolean }) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const count = task.updates.length;

  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        Follow-up {count > 0 ? `(${count})` : ""}
      </summary>
      <div className="mt-2 space-y-2 border-l pl-3">
        {task.updates.map((u) => (
          <div key={u.id} className="text-xs">
            <span className="text-muted-foreground">{fmt(u.created_at)}</span>{" "}
            <span className="font-medium">{u.author_name ?? "—"}</span>
            {u.new_status && (
              <>
                {" "}→ <span className="font-medium">{TRANSPORT_STATUS_LABEL[u.new_status]}</span>
              </>
            )}
            {u.note && <p className="text-foreground">{u.note}</p>}
          </div>
        ))}
        {count === 0 && <p className="text-xs text-muted-foreground">No follow-ups yet.</p>}
        {canPost && (
          <form
            className="flex gap-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              startTransition(async () => {
                const res = await addTaskFollowUp(task.id, note);
                if (!res.ok) setError(res.error ?? "Could not post.");
                else setNote("");
              });
            }}
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a follow-up note…"
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
            />
            <Button size="sm" variant="outline" type="submit" disabled={pending || !note.trim()}>
              Post
            </Button>
          </form>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </details>
  );
}
