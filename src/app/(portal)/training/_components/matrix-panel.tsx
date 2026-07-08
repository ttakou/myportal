"use client";

import { useState } from "react";
import { Grid3x3, Trash2 } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RequirementRow } from "@/lib/training";
import { addRequirement, deleteRequirement } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

const APPLIES = [
  { value: "all", label: "Everyone" },
  { value: "department", label: "Department" },
  { value: "job_title", label: "Job title" },
  { value: "employee_type", label: "Employee type" },
  { value: "competency", label: "Competency holders" },
];

export function MatrixPanel({
  requirements,
  courses,
  competencies,
}: {
  requirements: RequirementRow[];
  courses: { id: string; title: string }[];
  competencies: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [courseId, setCourseId] = useState("");
  const [appliesTo, setAppliesTo] = useState("all");
  const [appliesValue, setAppliesValue] = useState("");
  const [recurrence, setRecurrence] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed.");
      else onOk?.();
    });
  }

  const appliesLabel = (r: RequirementRow) =>
    r.applies_to === "all"
      ? "Everyone"
      : `${APPLIES.find((a) => a.value === r.applies_to)?.label ?? r.applies_to}: ${r.applies_value_label ?? "—"}`;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Grid3x3 className="h-5 w-5 text-primary" /> Statutory Training Matrix
        </h2>
        <p className="text-sm text-muted-foreground">
          Map which courses are required for whom. These drive each employee&apos;s Mandatory Training.
        </p>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-5">
        <label className="text-xs text-muted-foreground sm:col-span-2">
          Course
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={cn(field, "mt-0.5 block w-full")}>
            <option value="">— choose —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Applies to
          <select
            value={appliesTo}
            onChange={(e) => {
              setAppliesTo(e.target.value);
              setAppliesValue("");
            }}
            className={cn(field, "mt-0.5 block w-full")}
          >
            {APPLIES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Value
          {appliesTo === "competency" ? (
            <select
              value={appliesValue}
              onChange={(e) => setAppliesValue(e.target.value)}
              className={cn(field, "mt-0.5 block w-full")}
            >
              <option value="">— choose competency —</option>
              {competencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={appliesValue}
              onChange={(e) => setAppliesValue(e.target.value)}
              disabled={appliesTo === "all"}
              placeholder={appliesTo === "all" ? "—" : "e.g. Operations"}
              className={cn(field, "mt-0.5 block w-full disabled:opacity-50")}
            />
          )}
        </label>
        <label className="text-xs text-muted-foreground">
          Refresh (months)
          <input type="number" min={0} value={recurrence} onChange={(e) => setRecurrence(e.target.value)} placeholder="—" className={cn(field, "mt-0.5 block w-full")} />
        </label>
        <div className="flex items-end sm:col-span-5">
          <Button
            size="sm"
            disabled={pending || !courseId}
            onClick={() =>
              run(
                () =>
                  addRequirement({
                    courseId,
                    appliesTo,
                    appliesValue,
                    recurrenceMonths: recurrence ? Number(recurrence) : null,
                  }),
                () => {
                  setCourseId("");
                  setAppliesTo("all");
                  setAppliesValue("");
                  setRecurrence("");
                },
              )
            }
          >
            Add requirement
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Course</th>
              <th className="px-4 py-2 font-medium">Applies to</th>
              <th className="px-4 py-2 font-medium">Refresh</th>
              <th className="px-4 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2 font-medium">{r.course_title}</td>
                <td className="px-4 py-2 text-muted-foreground">{appliesLabel(r)}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.recurrence_months ? `${r.recurrence_months} mo` : "—"}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    disabled={pending}
                    title="Remove"
                    onClick={() => run(() => deleteRequirement(r.id))}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {requirements.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  No requirements defined yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
