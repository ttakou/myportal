"use client";

import { useMemo, useState, useTransition } from "react";
import { Play, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  STATUS_LABEL,
  type Appraisal,
  type AppraisalCycle,
  type AppraisalStatus,
} from "@/types/appraisal";
import { closeCycle, createCycle, launchCycle } from "../actions";

export function HrConsole({
  cycles,
  appraisals,
  activeCycleId,
}: {
  cycles: AppraisalCycle[];
  appraisals: Appraisal[];
  activeCycleId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const year = new Date().getFullYear();
  const [name, setName] = useState(`${year} Annual Appraisal`);
  const [start, setStart] = useState(`${year}-01-01`);
  const [end, setEnd] = useState(`${year}-12-31`);
  const [deadline, setDeadline] = useState("");

  const counts = useMemo(() => {
    const m = new Map<AppraisalStatus, number>();
    for (const a of appraisals) m.set(a.status, (m.get(a.status) ?? 0) + 1);
    return [...m.entries()];
  }, [appraisals]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">HR — appraisal cycles</h2>
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <form
        className="grid gap-2 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(() =>
            createCycle({
              name,
              year,
              periodStart: start,
              periodEnd: end,
              goalSettingDeadline: deadline || undefined,
            }),
          );
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cycle name" required className="rounded-md border bg-background px-3 py-2 text-sm lg:col-span-2" />
        <input value={start} onChange={(e) => setStart(e.target.value)} type="date" className="rounded-md border bg-background px-3 py-2 text-sm" />
        <input value={end} onChange={(e) => setEnd(e.target.value)} type="date" className="rounded-md border bg-background px-3 py-2 text-sm" />
        <Button type="submit" disabled={pending}>
          <Plus className="h-4 w-4" /> Create
        </Button>
        <label className="text-xs text-muted-foreground lg:col-span-2">
          Goal-setting deadline
          <input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date" className="mt-1 block w-full rounded-md border bg-background px-3 py-1.5 text-sm" />
        </label>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Cycle</th>
              <th className="px-4 py-2 font-medium">Period</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {cycles.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2 font-medium">{c.name}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {c.period_start} → {c.period_end}
                </td>
                <td className="px-4 py-2 capitalize">{c.status}</td>
                <td className="px-4 py-2 text-right">
                  {c.status === "draft" && (
                    <Button size="sm" disabled={pending} onClick={() => run(() => launchCycle(c.id))}>
                      <Play className="h-4 w-4" /> Launch
                    </Button>
                  )}
                  {c.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(() => closeCycle(c.id))}
                    >
                      <Lock className="h-4 w-4" /> Close
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {cycles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  No cycles yet — create one to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeCycleId && appraisals.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">Completion — active cycle ({appraisals.length} employees)</h3>
          <div className="flex flex-wrap gap-2">
            {counts.map(([status, n]) => (
              <span key={status} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                {STATUS_LABEL[status]}: <span className="font-semibold">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
