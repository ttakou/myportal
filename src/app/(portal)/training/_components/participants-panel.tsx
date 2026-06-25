"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PARTICIPANT_STATUS_LABEL,
  type Participant,
  type ParticipantStatus,
  type Session,
} from "@/types/training";
import { enrolParticipant, recordCompletion, setParticipantStatus } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
const STATUSES: ParticipantStatus[] = ["enrolled", "attended", "passed", "failed", "no_show", "cancelled"];

export function ParticipantsPanel({
  sessions,
  selectedId,
  participants,
  employees,
}: {
  sessions: Session[];
  selectedId: string | null;
  participants: Participant[];
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [enrolId, setEnrolId] = useState("");

  const session = sessions.find((s) => s.id === selectedId) ?? null;
  const enrolledIds = new Set(participants.map((p) => p.profile_id));
  const candidates = employees.filter((e) => !enrolledIds.has(e.id));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed.");
      else onOk?.();
    });
  }

  function selectSession(id: string) {
    router.push(`/training?view=participants${id ? `&session=${id}` : ""}`);
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="h-5 w-5 text-primary" /> Participants
        </h2>
        <p className="text-sm text-muted-foreground">
          Enrol people, mark attendance, then record completion — recording writes the certificate and
          feeds the employee&apos;s Mandatory Training compliance.
        </p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <label className="block text-xs text-muted-foreground">
        Session
        <select value={selectedId ?? ""} onChange={(e) => selectSession(e.target.value)} className={cn(field, "mt-0.5 block w-full max-w-xl")}>
          <option value="">— choose a session —</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.course_title}
              {s.starts_at ? ` · ${new Date(s.starts_at).toLocaleDateString()}` : ""} ({s.enrolled})
            </option>
          ))}
        </select>
      </label>

      {!session ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Pick a session to manage its participants.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
            <label className="text-xs text-muted-foreground">
              Enrol employee
              <select value={enrolId} onChange={(e) => setEnrolId(e.target.value)} className={cn(field, "mt-0.5 block w-64")}>
                <option value="">— choose —</option>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <Button size="sm" disabled={pending || !enrolId} onClick={() => run(() => enrolParticipant(session.id, enrolId), () => setEnrolId(""))}>
              Enrol
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Completion</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{p.full_name}</td>
                    <td className="px-4 py-2">
                      <select
                        value={p.status}
                        disabled={pending || p.recorded}
                        onChange={(e) => run(() => setParticipantStatus(p.id, e.target.value))}
                        className="rounded border bg-background px-1.5 py-0.5 text-xs disabled:opacity-60"
                      >
                        {STATUSES.map((st) => <option key={st} value={st}>{PARTICIPANT_STATUS_LABEL[st]}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {p.recorded ? (
                        <span className="text-xs font-medium text-green-700">Recorded ✓</span>
                      ) : (
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => recordCompletion(p.id))}>
                          Record completion
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {participants.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No one enrolled yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
