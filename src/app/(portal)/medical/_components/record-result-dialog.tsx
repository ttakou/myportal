"use client";

import { useState } from "react";
import { Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStatusTransition } from "@/components/activity";
import { FITNESS_LABEL, type FitnessStatus } from "@/types/medical";
import { recordMedicalResult } from "../actions";

const STATUSES: FitnessStatus[] = ["fit", "fit_with_restrictions", "unfit"];

/** Record the fitness result from a scheduled exam (admin / medical officer). */
export function RecordResultButton({
  scheduleId,
  personName,
  defaultExamDate,
  alreadyRecorded,
}: {
  scheduleId: string;
  personName: string | null;
  defaultExamDate: string | null;
  alreadyRecorded: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<FitnessStatus>("fit");
  const [examDate, setExamDate] = useState(defaultExamDate ?? "");
  const [expiry, setExpiry] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [notes, setNotes] = useState("");

  function submit() {
    setError(null);
    start(async () => {
      const res = await recordMedicalResult({
        scheduleId,
        fitnessStatus: status,
        examDate,
        expiryDate: expiry || undefined,
        restrictions: restrictions || undefined,
        notes: notes || undefined,
      });
      if (res.ok) setOpen(false);
      else setError(res.error ?? "Could not save.");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent"
      >
        <Stethoscope className="h-3.5 w-3.5" />
        {alreadyRecorded ? "Record again" : "Record result"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Record fitness result</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {personName ?? "Employee"} — writes the medical record and marks the exam complete.
            </p>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-muted-foreground">Fitness status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as FitnessStatus)}
                  className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{FITNESS_LABEL[s]}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-muted-foreground">Exam date</span>
                  <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)}
                    className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </label>
                <label className="block text-sm">
                  <span className="text-muted-foreground">Expiry date</span>
                  <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)}
                    className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-muted-foreground">Restrictions (optional)</span>
                <input value={restrictions} onChange={(e) => setRestrictions(e.target.value)} placeholder="e.g. no offshore travel"
                  className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Notes (optional)</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={pending}
                className="flex-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={submit} disabled={pending || !examDate}
                className={cn("flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50")}>
                {pending ? "Saving…" : "Save result"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
