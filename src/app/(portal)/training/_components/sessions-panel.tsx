"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SESSION_STATUS_LABEL, type Session, type SessionStatus, type Trainer } from "@/types/training";
import { setSessionStatus, upsertSession } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
const STATUSES: SessionStatus[] = ["planned", "open", "in_progress", "completed", "cancelled"];

function fmt(d: string | null): string {
  return d ? new Date(d).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

export function SessionsPanel({
  sessions,
  courses,
  trainers,
}: {
  sessions: Session[];
  courses: { id: string; title: string }[];
  trainers: Trainer[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [courseId, setCourseId] = useState("");
  const [trainerId, setTrainerId] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [capacity, setCapacity] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed.");
      else onOk?.();
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarClock className="h-5 w-5 text-primary" /> Training Sessions
        </h2>
        <p className="text-sm text-muted-foreground">Schedule course deliveries; enrol people in the Participants view.</p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-3">
        <label className="text-xs text-muted-foreground">
          Course
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={cn(field, "mt-0.5 block w-full")}>
            <option value="">— choose —</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Trainer
          <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className={cn(field, "mt-0.5 block w-full")}>
            <option value="">— none —</option>
            {trainers.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Starts
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Ends
          <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Capacity
          <input type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <div className="flex items-end sm:col-span-3">
          <Button size="sm" disabled={pending || !courseId} onClick={() => run(() => upsertSession({ courseId, trainerId: trainerId || null, location, startsAt: startsAt ? new Date(startsAt).toISOString() : undefined, endsAt: endsAt ? new Date(endsAt).toISOString() : undefined, capacity: capacity ? Number(capacity) : null }), () => { setCourseId(""); setTrainerId(""); setLocation(""); setStartsAt(""); setEndsAt(""); setCapacity(""); })}>
            Schedule session
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Course</th>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Trainer</th>
              <th className="px-4 py-2 font-medium">Enrolled</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-2 font-medium">{s.course_title}{s.location ? <span className="ml-2 text-xs text-muted-foreground">{s.location}</span> : null}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmt(s.starts_at)}</td>
                <td className="px-4 py-2 text-muted-foreground">{s.trainer_name ?? "—"}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{s.enrolled}{s.capacity ? `/${s.capacity}` : ""}</td>
                <td className="px-4 py-2">
                  <select
                    value={s.status}
                    disabled={pending}
                    onChange={(e) => run(() => setSessionStatus(s.id, e.target.value))}
                    className="rounded border bg-background px-1.5 py-0.5 text-xs"
                  >
                    {STATUSES.map((st) => <option key={st} value={st}>{SESSION_STATUS_LABEL[st]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No sessions scheduled.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
