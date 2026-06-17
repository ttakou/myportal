"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { NINE_BOX_LABELS, type NineBoxCell } from "@/types/performance";
import { setNineBox } from "../actions";

/**
 * 9-box talent grid (admin only). OKRs and continuous feedback used to live here
 * too — they were retired in favour of the annual appraisal module.
 */
export function PerformanceBoard({
  users,
  nineBox,
}: {
  users: { id: string; name: string }[];
  nineBox: NineBoxCell[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState(users[0]?.id ?? "");
  const [perf, setPerf] = useState("2");
  const [pot, setPot] = useState("2");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  const at = (performance: number, potential: number) =>
    nineBox.filter((c) => c.performance === performance && c.potential === potential);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">9-box talent grid</h2>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-3 gap-2">
        {[3, 2, 1].map((potential) =>
          [1, 2, 3].map((performance) => {
            const people = at(performance, potential);
            return (
              <div key={`${performance}-${potential}`} className="min-h-[84px] rounded-lg border bg-card p-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {NINE_BOX_LABELS[`${performance}-${potential}`]}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {people.map((p) => (
                    <span key={p.profile_id} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {p.person_name}
                    </span>
                  ))}
                </div>
              </div>
            );
          }),
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Columns: performance (low → high) · Rows: potential (high → low)
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setNineBox({ profileId, performance: Number(perf), potential: Number(pot), period: "Q2 2026" }));
        }}
        className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4"
      >
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className="rounded-md border bg-background px-2 py-2 text-sm">
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <label className="text-xs text-muted-foreground">
          Performance
          <select value={perf} onChange={(e) => setPerf(e.target.value)} className="mt-1 block rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="1">Low</option><option value="2">Medium</option><option value="3">High</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Potential
          <select value={pot} onChange={(e) => setPot(e.target.value)} className="mt-1 block rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="1">Low</option><option value="2">Medium</option><option value="3">High</option>
          </select>
        </label>
        <Button size="sm" type="submit" disabled={pending}>Place</Button>
      </form>
    </section>
  );
}
