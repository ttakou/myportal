"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MealRedemptionHistoryRow } from "@/types/canteen";

function personLabel(name: string | null, email: string) {
  return name || email || "—";
}

/**
 * Historical trace of meals actually taken (allocations consumed) over a date
 * range — who ate, when and who served it. The range is driven by URL params so
 * it survives refresh and is server-rendered.
 */
export function RedemptionHistory({
  rows,
  from,
  to,
}: {
  rows: MealRedemptionHistoryRow[];
  from: string;
  to: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  function apply() {
    const q = new URLSearchParams(params.toString());
    q.set("from", f);
    q.set("to", t);
    router.push(`?${q.toString()}`);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Redemption history</h2>
          <p className="text-sm text-muted-foreground">
            Every meal taken in the period — who, when and who served it.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs font-medium">
            From
            <input
              type="date"
              value={f}
              onChange={(e) => setF(e.target.value)}
              className="mt-1 block rounded-md border px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs font-medium">
            To
            <input
              type="date"
              value={t}
              onChange={(e) => setT(e.target.value)}
              className="mt-1 block rounded-md border px-2 py-1 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={apply}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Apply
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No meals were redeemed in this period.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Served by</th>
                <th className="px-4 py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-muted-foreground">{r.redeemed_on}</td>
                  <td className="px-4 py-2 font-medium">{personLabel(r.full_name, r.email)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.served_by_name ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            {rows.length} meal(s)
          </p>
        </div>
      )}
    </section>
  );
}
