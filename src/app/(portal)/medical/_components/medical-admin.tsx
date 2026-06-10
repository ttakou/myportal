"use client";

import { useState, useTransition } from "react";
import { HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  FITNESS_LABEL,
  daysToExpiry,
  type FitnessStatus,
  type MedicalRecord,
} from "@/types/medical";
import { recordMedical } from "../actions";

const STATUSES: FitnessStatus[] = ["fit", "fit_with_restrictions", "unfit", "pending"];
const STATUS_STYLE: Record<FitnessStatus, string> = {
  fit: "bg-green-100 text-green-700",
  fit_with_restrictions: "bg-amber-100 text-amber-700",
  unfit: "bg-destructive/10 text-destructive",
  pending: "bg-muted text-muted-foreground",
};

export function MedicalAdmin({
  roster,
  users,
}: {
  roster: MedicalRecord[];
  users: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [profileId, setProfileId] = useState(users[0]?.id ?? "");
  const [status, setStatus] = useState<FitnessStatus>("fit");
  const [examDate, setExamDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [restrictions, setRestrictions] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Medical officer · roster</h2>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => recordMedical({ profileId, fitnessStatus: status, examDate, expiryDate, restrictions }),
            () => { setExamDate(""); setExpiryDate(""); setRestrictions(""); },
          );
        }}
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as FitnessStatus)} className="rounded-md border bg-background px-3 py-2 text-sm">
          {STATUSES.map((s) => <option key={s} value={s}>{FITNESS_LABEL[s]}</option>)}
        </select>
        <input value={restrictions} onChange={(e) => setRestrictions(e.target.value)} placeholder="Restrictions (optional)" className="rounded-md border bg-background px-3 py-2 text-sm" />
        <label className="text-xs text-muted-foreground">Exam date<input value={examDate} onChange={(e) => setExamDate(e.target.value)} type="date" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" /></label>
        <label className="text-xs text-muted-foreground">Expiry date<input value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} type="date" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" /></label>
        <Button type="submit" disabled={pending} className="self-end"><HeartPulse className="h-4 w-4" /> Record</Button>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-3 font-medium">Employee</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Expiry</th><th className="px-4 py-3 font-medium">Restrictions</th></tr>
          </thead>
          <tbody className="divide-y">
            {roster.map((r) => {
              const d = daysToExpiry(r.expiry_date);
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium">{r.person_name || r.person_email}</td>
                  <td className="px-4 py-3"><span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLE[r.fitness_status])}>{FITNESS_LABEL[r.fitness_status]}</span></td>
                  <td className={cn("px-4 py-3", d != null && d < 0 ? "text-destructive" : d != null && d <= 30 ? "text-amber-600" : "text-muted-foreground")}>
                    {r.expiry_date ?? "—"}{d != null && (d < 0 ? " (expired)" : d <= 30 ? ` (${d}d)` : "")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.restrictions ?? "—"}</td>
                </tr>
              );
            })}
            {roster.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No records.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
