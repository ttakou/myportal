"use client";

import { useState } from "react";
import { Send, Trash2, Lock, Award } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActivityKind, ContinuousActivity } from "@/types/continuous";
import type { DirectoryEntry } from "@/lib/continuous";
import { createActivity, deleteActivity } from "../continuous-activity-actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
const BADGES = ["Teamwork", "Innovation", "Leadership", "Customer focus", "Ownership"];

export function ActivityPanel({
  kind,
  items,
  directory,
  myId,
  subjectMode,
  allowPrivate,
  withBadge,
  withTitle,
  composerCta,
  placeholder,
  subjectLabel,
}: {
  kind: ActivityKind;
  items: ContinuousActivity[];
  directory: DirectoryEntry[];
  myId: string;
  subjectMode: "self" | "pick";
  allowPrivate: boolean;
  withBadge: boolean;
  withTitle: boolean;
  composerCta: string;
  placeholder: string;
  subjectLabel: string;
}) {
  const colleagues = directory.filter((d) => d.id !== myId);
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [badge, setBadge] = useState(withBadge ? BADGES[0] : "");
  const [pending, startTransition] = useStatusTransition("Posting…");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createActivity({
        kind,
        subjectId: subjectMode === "self" ? myId : subjectId,
        title: withTitle ? title : null,
        body,
        isPrivate: allowPrivate ? isPrivate : false,
        data: withBadge && badge ? { badge } : {},
      });
      if (!res.ok) {
        setError(res.error ?? "Couldn't post.");
        return;
      }
      setTitle("");
      setBody("");
      setSubjectId("");
      setIsPrivate(false);
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
        {subjectMode === "pick" && (
          <label className="block text-xs text-muted-foreground">
            {subjectLabel}
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className={cn(field, "mt-0.5 block w-full py-1.5 sm:w-72")}
            >
              <option value="">Choose a colleague…</option>
              {colleagues.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
        )}
        {withBadge && (
          <div className="flex flex-wrap gap-1.5">
            {BADGES.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBadge(b)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  badge === b ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {b}
              </button>
            ))}
          </div>
        )}
        {withTitle && (
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className={cn(field, "block w-full py-1.5")} />
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className={cn(field, "block w-full")}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {allowPrivate ? (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="h-4 w-4" />
              <Lock className="h-3.5 w-3.5" /> Private
            </label>
          ) : (
            <span />
          )}
          <Button size="sm" disabled={pending} onClick={submit}>
            <Send className="h-4 w-4" /> {composerCta}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {(a.authorName ?? "Anonymous")}
                    {subjectMode === "pick" && a.subjectName ? ` → ${a.subjectName}` : ""}
                    {" · "}
                    {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ""}
                    {a.isPrivate && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600">
                        <Lock className="h-3 w-3" /> private
                      </span>
                    )}
                  </p>
                  {typeof a.data.badge === "string" && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      <Award className="h-3 w-3" /> {a.data.badge}
                    </span>
                  )}
                  {a.title && <p className="mt-0.5 text-sm font-medium">{a.title}</p>}
                  {a.body && <p className="text-sm">{a.body}</p>}
                </div>
                {a.authorId === myId && (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(a.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
