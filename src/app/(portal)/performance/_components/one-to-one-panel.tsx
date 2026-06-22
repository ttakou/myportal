"use client";

import { useState } from "react";
import { CalendarDays, Send, Trash2 } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ContinuousActivity } from "@/types/continuous";
import type { DirectoryEntry } from "@/lib/continuous";
import { createActivity, deleteActivity } from "../continuous-activity-actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

export function OneToOnePanel({
  items,
  directory,
  myId,
}: {
  items: ContinuousActivity[];
  directory: DirectoryEntry[];
  myId: string;
}) {
  const colleagues = directory.filter((d) => d.id !== myId);
  const nameById = new Map(directory.map((d) => [d.id, d.name]));
  const [withId, setWithId] = useState("");
  const [date, setDate] = useState("");
  const [agenda, setAgenda] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useStatusTransition("Posting…");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!withId) {
      setError("Pick who the meeting is with.");
      return;
    }
    if (!agenda.trim() && !notes.trim()) {
      setError("Add an agenda or notes.");
      return;
    }
    startTransition(async () => {
      const res = await createActivity({
        kind: "one_to_one",
        subjectId: myId,
        counterpartId: withId,
        body: notes,
        data: { agenda, date },
      });
      if (!res.ok) {
        setError(res.error ?? "Couldn't post.");
        return;
      }
      setWithId("");
      setDate("");
      setAgenda("");
      setNotes("");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteActivity(id);
    });
  }

  const otherName = (a: ContinuousActivity) => {
    const otherId = a.authorId === myId ? a.counterpartId : a.authorId;
    return (otherId && nameById.get(otherId)) || a.authorName || "Colleague";
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <label className="text-xs text-muted-foreground">
            With
            <select value={withId} onChange={(e) => setWithId(e.target.value)} className={cn(field, "mt-0.5 block w-56 py-1.5")}>
              <option value="">Choose a colleague…</option>
              {colleagues.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(field, "mt-0.5 block py-1.5")} />
          </label>
        </div>
        <input value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="Agenda" className={cn(field, "block w-full py-1.5")} />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes / talking points…" rows={2} className={cn(field, "block w-full")} />
        <div className="flex justify-end">
          <Button size="sm" disabled={pending} onClick={submit}>
            <Send className="h-4 w-4" /> Log meeting
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
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" />
                    1:1 with {otherName(a)}
                    {typeof a.data.date === "string" && a.data.date ? ` · ${a.data.date}` : ""}
                  </p>
                  {typeof a.data.agenda === "string" && a.data.agenda && (
                    <p className="mt-0.5 text-sm font-medium">{a.data.agenda}</p>
                  )}
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
