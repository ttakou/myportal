"use client";

import { useState } from "react";
import { CalendarPlus, Download } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import type { OpenSession } from "@/types/training";
import { selfEnrolSession, withdrawEnrolment } from "../actions";

function fmtDateTime(d: string | null) {
  return d ? new Date(d).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

export function OpenSessionsPanel({ sessions }: { sessions: OpenSession[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed.");
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarPlus className="h-5 w-5 text-primary" /> Open Sessions
        </h2>
        <p className="text-sm text-muted-foreground">Sessions open for enrolment — register yourself for the ones you need.</p>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {sessions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No sessions are open for enrolment right now.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Course</th>
                <th className="px-4 py-2 font-medium">Starts</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Seats</th>
                <th className="px-4 py-2 font-medium text-right">Enrolment</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const enrolled = s.my_participant_id && s.my_status !== "cancelled";
                const full = s.capacity != null && s.enrolled >= s.capacity;
                return (
                  <tr key={s.id} className="border-t">
                    <td className="px-4 py-2 font-medium">
                      {s.course_title}
                      {s.trainer_name && <span className="ml-2 text-xs text-muted-foreground">{s.trainer_name}</span>}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDateTime(s.starts_at)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{s.location ?? "—"}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {s.capacity != null ? `${s.enrolled}/${s.capacity}` : s.enrolled}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2">
                        {enrolled ? (
                          <>
                            <a
                              href={`/training/invite/${s.my_participant_id}`}
                              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/40"
                            >
                              <Download className="h-3.5 w-3.5" /> Invite
                            </a>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() => run(() => withdrawEnrolment(s.my_participant_id!))}
                            >
                              Withdraw
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" disabled={pending || full} onClick={() => run(() => selfEnrolSession(s.id))}>
                            {full ? "Full" : "Enrol"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
