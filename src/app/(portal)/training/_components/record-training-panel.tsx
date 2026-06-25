"use client";

import { useMemo, useState } from "react";
import { FileCheck2 } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { recordTrainingForEmployee } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

export function RecordTrainingPanel({
  employees,
  courses,
}: {
  employees: { id: string; name: string }[];
  courses: { id: string; title: string; validity_months: number | null }[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [profileId, setProfileId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [completedOn, setCompletedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [certNo, setCertNo] = useState("");
  const [certUrl, setCertUrl] = useState("");
  const [score, setScore] = useState("");

  const course = courses.find((c) => c.id === courseId);

  // Preview the auto-computed expiry (completion + validity months) unless the
  // admin typed an explicit one.
  const autoExpiry = useMemo(() => {
    if (expiresOn || !completedOn || !course?.validity_months) return null;
    const d = new Date(completedOn + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + course.validity_months);
    return d.toISOString().slice(0, 10);
  }, [completedOn, expiresOn, course]);

  function submit() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await recordTrainingForEmployee({
        profileId,
        courseId,
        completedOn,
        expiresOn: expiresOn || null,
        certificateNo: certNo,
        certificateUrl: certUrl,
        score: score ? Number(score) : null,
      });
      if (!res.ok) setError(res.error ?? "Failed.");
      else {
        const who = employees.find((e) => e.id === profileId)?.name ?? "Employee";
        setInfo(`Recorded ${course?.title ?? "training"} for ${who}.`);
        // keep the employee selected for fast batch entry; clear the rest
        setCourseId("");
        setCompletedOn("");
        setExpiresOn("");
        setCertNo("");
        setCertUrl("");
        setScore("");
      }
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileCheck2 className="h-5 w-5 text-primary" /> Record Training
        </h2>
        <p className="text-sm text-muted-foreground">
          Log a completed or external certificate for an employee. Expiry is computed from the course&apos;s validity, and
          it counts toward compliance immediately (verified).
        </p>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      {info && <p className="rounded-md bg-green-100 px-4 py-2 text-sm text-green-700">{info}</p>}

      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Employee
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={cn(field, "mt-0.5 block w-full")}>
            <option value="">— choose —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Course
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={cn(field, "mt-0.5 block w-full")}>
            <option value="">— choose —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.validity_months ? ` · valid ${c.validity_months} mo` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-muted-foreground">
          Completed on
          <input type="date" value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Expires on (optional)
          <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={cn(field, "mt-0.5 block w-full")} />
          {autoExpiry && <span className="mt-0.5 block text-[11px] text-muted-foreground">Auto: expires {autoExpiry}</span>}
          {!autoExpiry && course && !course.validity_months && completedOn && (
            <span className="mt-0.5 block text-[11px] text-muted-foreground">No validity set — never expires.</span>
          )}
        </label>

        <label className="text-xs text-muted-foreground">
          Certificate # (optional)
          <input value={certNo} onChange={(e) => setCertNo(e.target.value)} className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <label className="text-xs text-muted-foreground">
          Score (optional)
          <input type="number" min={0} step="0.1" value={score} onChange={(e) => setScore(e.target.value)} className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <label className="text-xs text-muted-foreground sm:col-span-2">
          Certificate link / URL (optional)
          <input value={certUrl} onChange={(e) => setCertUrl(e.target.value)} placeholder="https://…" className={cn(field, "mt-0.5 block w-full")} />
        </label>

        <div className="flex items-end sm:col-span-2">
          <Button size="sm" disabled={pending || !profileId || !courseId || !completedOn} onClick={submit}>
            Record training
          </Button>
          <span className="ml-3 self-center text-xs text-muted-foreground">
            Linked competencies are raised automatically.
          </span>
        </div>
      </div>
    </section>
  );
}
