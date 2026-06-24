"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Trash2 } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Participant, Session } from "@/types/training";
import type { EvalRow } from "@/lib/training";
import { addEvaluation, deleteEvaluation } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
const KINDS = [
  { value: "reaction", label: "Reaction" },
  { value: "learning", label: "Learning" },
  { value: "behaviour", label: "Behaviour" },
  { value: "results", label: "Results" },
];

export function EvaluationsPanel({
  sessions,
  selectedId,
  participants,
  evaluations,
}: {
  sessions: Session[];
  selectedId: string | null;
  participants: Participant[];
  evaluations: EvalRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState("");
  const [kind, setKind] = useState("reaction");
  const [score, setScore] = useState("");
  const [comments, setComments] = useState("");

  const session = sessions.find((s) => s.id === selectedId) ?? null;

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
          <Star className="h-5 w-5 text-primary" /> Evaluations
        </h2>
        <p className="text-sm text-muted-foreground">Capture post-training evaluation scores; these feed the Effectiveness report.</p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <label className="block text-xs text-muted-foreground">
        Session
        <select value={selectedId ?? ""} onChange={(e) => router.push(`/training?view=evaluations${e.target.value ? `&session=${e.target.value}` : ""}`)} className={cn(field, "mt-0.5 block w-full max-w-xl")}>
          <option value="">— choose a session —</option>
          {sessions.map((s) => <option key={s.id} value={s.id}>{s.course_title}{s.starts_at ? ` · ${new Date(s.starts_at).toLocaleDateString()}` : ""}</option>)}
        </select>
      </label>

      {!session ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Pick a session to record evaluations.</p>
      ) : (
        <>
          <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-5">
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={cn(field, "sm:col-span-2")}>
              <option value="">— participant —</option>
              {participants.map((p) => <option key={p.id} value={p.profile_id}>{p.full_name}</option>)}
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <input type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} placeholder="Score" className={field} />
            <input value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Comments" className={cn(field, "sm:col-span-4")} />
            <div className="flex items-center sm:col-span-1">
              <Button size="sm" disabled={pending || !profileId} onClick={() => run(() => addEvaluation({ sessionId: session.id, profileId, kind, score: score ? Number(score) : null, comments }), () => { setProfileId(""); setScore(""); setComments(""); })}>
                Record
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Participant</th>
                  <th className="px-4 py-2 font-medium">Level</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                  <th className="px-4 py-2 font-medium">Comments</th>
                  <th className="px-4 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{e.person}</td>
                    <td className="px-4 py-2 capitalize text-muted-foreground">{e.kind}</td>
                    <td className="px-4 py-2 tabular-nums">{e.score ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{e.comments ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <button disabled={pending} title="Remove" onClick={() => run(() => deleteEvaluation(e.id))} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
                {evaluations.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No evaluations yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
