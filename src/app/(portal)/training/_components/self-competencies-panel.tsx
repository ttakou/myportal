"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { cn } from "@/lib/utils";
import type { EmployeeCompetency } from "@/types/training";
import { selfAssessCompetency } from "../actions";

function fmtDate(d: string | null) {
  return d ? new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export function SelfCompetenciesPanel({ items }: { items: EmployeeCompetency[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function assess(competencyId: string, level: number) {
    setError(null);
    startTransition(async () => {
      const res = await selfAssessCompetency(competencyId, level);
      if (!res.ok) setError(res.error ?? "Failed.");
    });
  }

  const assessed = items.filter((i) => i.current_level > 0 || i.self_level != null).length;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-5 w-5 text-primary" /> My Competencies
        </h2>
        <p className="text-sm text-muted-foreground">
          {assessed} of {items.length} assessed. Record your own self-assessment — HR keeps the validated level separately.
        </p>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No competencies defined yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Competency</th>
                <th className="px-4 py-2 font-medium">Validated</th>
                <th className="px-4 py-2 font-medium">Self-assessment</th>
                <th className="px-4 py-2 font-medium">Self-assessed</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.competency_id} className="border-t">
                  <td className="px-4 py-2 font-medium">
                    {c.name}
                    {c.category && <span className="ml-2 text-xs text-muted-foreground">{c.category}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {Array.from({ length: c.max_level }).map((_, i) => (
                          <span key={i} className={cn("h-2.5 w-2.5 rounded-sm", i < c.current_level ? "bg-primary" : "bg-muted")} />
                        ))}
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">{c.current_level}/{c.max_level}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={c.self_level ?? ""}
                      disabled={pending}
                      onChange={(e) => assess(c.competency_id, Number(e.target.value))}
                      className="rounded-md border bg-background px-2 py-1 text-sm"
                    >
                      <option value="">— rate —</option>
                      {Array.from({ length: c.max_level + 1 }).map((_, i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">{fmtDate(c.self_assessed_on)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
