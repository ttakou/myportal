"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface PeriodPreset {
  key: string;
  label: string;
  from: string;
  to: string;
}

/**
 * Period selector for the Training KPI dashboard: quick presets (this year /
 * last year / rolling 12 months) plus a custom from–to range. Navigates by
 * updating the ?from=&to= query params the panel reads.
 */
export function KpiPeriodPicker({
  presets,
  activeKey,
  from,
  to,
}: {
  presets: PeriodPreset[];
  activeKey: string | null;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  const go = (nf: string, nt: string) =>
    router.push(`/training?view=kpis&from=${nf}&to=${nt}`);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => go(p.from, p.to)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeKey === p.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="date"
          value={f}
          max={t}
          onChange={(e) => setF(e.target.value)}
          aria-label="From date"
          className="rounded-md border bg-background px-2 py-1 text-foreground"
        />
        <span>–</span>
        <input
          type="date"
          value={t}
          min={f}
          onChange={(e) => setT(e.target.value)}
          aria-label="To date"
          className="rounded-md border bg-background px-2 py-1 text-foreground"
        />
        <button
          type="button"
          onClick={() => f && t && go(f, t)}
          className="rounded-md border border-primary bg-primary px-3 py-1 font-medium text-primary-foreground hover:opacity-90"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
