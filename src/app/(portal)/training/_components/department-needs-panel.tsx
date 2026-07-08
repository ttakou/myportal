"use client";

import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeptNeedRow } from "@/lib/training";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

export function DepartmentNeedsPanel({
  departments,
  selected,
  needs,
  population,
}: {
  departments: string[];
  selected: string | null;
  needs: DeptNeedRow[];
  population: number;
}) {
  const router = useRouter();
  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Target className="h-5 w-5 text-primary" /> Department Training Needs
        </h2>
        <p className="text-sm text-muted-foreground">
          Mandatory courses still outstanding (not done / expired / expiring) across the chosen population.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-muted-foreground">
          Population
          <select
            value={selected ?? ""}
            onChange={(e) => router.push(`/training?view=dept-needs${e.target.value ? `&dept=${encodeURIComponent(e.target.value)}` : ""}`)}
            className={cn(field, "ml-2")}
          >
            <option value="">Whole organisation</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-muted-foreground">{population} staff in scope</span>
      </div>

      {needs.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No outstanding mandatory training across {selected ?? "the organisation"}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Course</th>
                <th className="px-4 py-2 font-medium">Staff needing it</th>
              </tr>
            </thead>
            <tbody>
              {needs.map((r) => (
                <tr key={r.title} className="border-t">
                  <td className="px-4 py-2 font-medium">{r.title}</td>
                  <td className="px-4 py-2 tabular-nums">
                    <span className="font-semibold text-amber-700">{r.needing}</span>
                    <span className="text-muted-foreground"> / {r.total} required</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
