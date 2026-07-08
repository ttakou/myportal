"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ImportBatchSummary } from "@/lib/savings";
import { cancelImportBatch } from "../actions";

const STATUS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  committed: "bg-green-100 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

/** Admin overview of recent import batches and their approval progress. */
export function ImportBatchesPanel({ batches }: { batches: ImportBatchSummary[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  function cancel(id: string) {
    if (!window.confirm("Cancel this pending import?")) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelImportBatch(id);
      if (!res.ok) setError(res.error ?? "Could not cancel.");
    });
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Import batches</h2>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Progress</th>
              <th className="px-4 py-3 font-medium">Submitted by</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {batches.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2 font-medium tabular-nums">{b.period}</td>
                <td className="px-4 py-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS[b.status] ?? "bg-muted")}>
                    {b.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {b.status === "committed" && b.committed
                    ? `${b.committed.applied} credited${b.committed.skipped ? `, ${b.committed.skipped} skipped` : ""}${b.committed.failed ? `, ${b.committed.failed} failed` : ""}`
                    : b.status === "pending"
                      ? `Step ${b.currentStep + 1} of ${b.totalSteps}${b.stepName ? ` · ${b.stepName}` : ""}`
                      : "—"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{b.submittedBy ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  {b.status === "pending" && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => cancel(b.id)}>
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
