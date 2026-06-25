"use client";

import { useState } from "react";
import { CalendarRange, Trash2 } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLAN_STATUS_LABEL, type PlanStatus } from "@/types/training";
import type { PlanRowAll } from "@/lib/training";
import { addPlanItem, deletePlanItem, setPlanItemStatus } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";
const STATUSES: PlanStatus[] = ["planned", "scheduled", "in_progress", "completed", "deferred", "cancelled"];

export function AnnualPlanPanel({
  items,
  employees,
  courses,
}: {
  items: PlanRowAll[];
  employees: { id: string; name: string }[];
  courses: { id: string; title: string }[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState("");

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
          <CalendarRange className="h-5 w-5 text-primary" /> Annual Training Plan
        </h2>
        <p className="text-sm text-muted-foreground">Plan courses for employees by year and period.</p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-5">
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={cn(field, "sm:col-span-2")}>
          <option value="">— employee —</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={cn(field, "sm:col-span-2")}>
          <option value="">— course —</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} className={field} />
        <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Period (e.g. Q2)" className={cn(field, "sm:col-span-2")} />
        <div className="flex items-center sm:col-span-3">
          <Button size="sm" disabled={pending || !profileId || !courseId} onClick={() => run(() => addPlanItem({ profileId, courseId, planYear: year, period }), () => { setProfileId(""); setCourseId(""); setPeriod(""); })}>
            Add to plan
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Member</th>
              <th className="px-4 py-2 font-medium">Course</th>
              <th className="px-4 py-2 font-medium">Year</th>
              <th className="px-4 py-2 font-medium">Period</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2 font-medium">{p.member}</td>
                <td className="px-4 py-2">{p.course_title ?? "—"}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{p.plan_year}</td>
                <td className="px-4 py-2 text-muted-foreground">{p.period ?? "—"}</td>
                <td className="px-4 py-2">
                  <select value={p.status} disabled={pending} onChange={(e) => run(() => setPlanItemStatus(p.id, e.target.value))} className="rounded border bg-background px-1.5 py-0.5 text-xs">
                    {STATUSES.map((st) => <option key={st} value={st}>{PLAN_STATUS_LABEL[st]}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2 text-right">
                  <button disabled={pending} title="Remove" onClick={() => run(() => deletePlanItem(p.id))} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No plan items yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
