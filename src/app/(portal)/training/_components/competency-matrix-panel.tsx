"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Network } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { cn } from "@/lib/utils";
import type { EmployeeCompetency } from "@/types/training";
import { setEmployeeCompetency } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

export function CompetencyMatrixPanel({
  employees,
  selectedId,
  items,
}: {
  employees: { id: string; name: string }[];
  selectedId: string | null;
  items: EmployeeCompetency[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed.");
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Network className="h-5 w-5 text-primary" /> Competency Matrix
        </h2>
        <p className="text-sm text-muted-foreground">Assess an employee&apos;s level against each competency.</p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <label className="block text-xs text-muted-foreground">
        Employee
        <select
          value={selectedId ?? ""}
          onChange={(e) => router.push(`/training?view=competency-matrix${e.target.value ? `&person=${e.target.value}` : ""}`)}
          className={cn(field, "mt-0.5 block w-full max-w-xl")}
        >
          <option value="">— choose an employee —</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </label>

      {!selectedId ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Pick an employee to assess.</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No competencies defined yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Competency</th>
                <th className="px-4 py-2 font-medium">Current</th>
                <th className="px-4 py-2 font-medium">Set level</th>
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
                    <div className="flex gap-0.5">
                      {Array.from({ length: c.max_level }).map((_, i) => (
                        <span key={i} className={cn("h-2.5 w-2.5 rounded-sm", i < c.current_level ? "bg-primary" : "bg-muted")} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={c.current_level}
                      disabled={pending}
                      onChange={(e) => run(() => setEmployeeCompetency(selectedId, c.competency_id, Number(e.target.value)))}
                      className="rounded border bg-background px-1.5 py-0.5 text-xs"
                    >
                      {Array.from({ length: c.max_level + 1 }).map((_, i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </select>
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
