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
import { addChecklistItem, addTaskFollowUp, toggleChecklistItem } from "../actions";

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

/**
 * Per-task checklist. The driver/dispatcher tick items (canTick); the
 * dispatcher can also append custom steps (canAdd). Read-only for everyone
 * else (e.g. the requester watching progress).
 */
export function Checklist({
  task,
  canTick,
  canAdd = false,
}: {
  task: TransportRequest;
  canTick: boolean;
  canAdd?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const items = task.checklist;
  if (items.length === 0 && !canAdd) return null;
  const done = items.filter((i) => i.done).length;

  return (
    <details className="mt-1" open={canTick && done < items.length}>
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        Checklist {items.length > 0 ? `(${done}/${items.length})` : ""}
      </summary>
      <div className="mt-2 space-y-1 border-l pl-3">
        {items.map((item) => (
          <label
            key={item.id}
            className={cn(
              "flex items-center gap-2 text-sm",
              !canTick && "pointer-events-none",
              item.done && "text-muted-foreground line-through",
            )}
          >
            <input
              type="checkbox"
              checked={item.done}
              disabled={pending || !canTick}
              onChange={(e) => {
                setError(null);
                startTransition(async () => {
                  const res = await toggleChecklistItem(item.id, e.target.checked);
                  if (!res.ok) setError(res.error ?? "Could not update item.");
                });
              }}
            />
            {item.label}
          </label>
        ))}
        {canAdd && (
          <form
            className="flex gap-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              startTransition(async () => {
                const res = await addChecklistItem(task.id, label);
                if (!res.ok) setError(res.error ?? "Could not add item.");
                else setLabel("");
              });
            }}
          >
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Add a step…"
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
            />
            <Button size="sm" variant="outline" type="submit" disabled={pending || !label.trim()}>
              Add
            </Button>
          </form>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </details>
  );
}

/** Collapsible two-way message thread plus an "add message" box. */
export function FollowUps({ task, canPost }: { task: TransportRequest; canPost: boolean }) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const count = task.updates.length;

  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        Messages {count > 0 ? `(${count})` : ""}
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
        {count === 0 && <p className="text-xs text-muted-foreground">No messages yet.</p>}
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
              placeholder="Write a message…"
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
