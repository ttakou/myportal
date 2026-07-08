"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Check, X, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { money } from "@/types/savings";
import type { PendingImportApproval, ImportImpactRow } from "@/lib/savings";
import { decideImportBatch } from "../actions";

const STATUS_BADGE: Record<ImportImpactRow["status"], { label: string; cls: string }> = {
  apply: { label: "Will credit", cls: "bg-green-100 text-green-700" },
  "new-account": { label: "New account", cls: "bg-blue-100 text-blue-700" },
  skip: { label: "Already imported", cls: "bg-muted text-muted-foreground" },
  error: { label: "Error", cls: "bg-destructive/10 text-destructive" },
};

/** Validator inbox: pending import batches the user can approve at the current step. */
export function ImportApprovalsInbox({ approvals }: { approvals: PendingImportApproval[] }) {
  if (approvals.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Inbox className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Savings imports awaiting your approval</h2>
      </div>
      {approvals.map((a) => (
        <ApprovalCard key={a.batchId} approval={a} />
      ))}
    </section>
  );
}

function ApprovalCard({ approval: a }: { approval: PendingImportApproval }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function decide(approve: boolean) {
    setError(null);
    let note: string | undefined;
    if (!approve) note = window.prompt("Reason for rejecting (optional):") ?? undefined;
    startTransition(async () => {
      const res = await decideImportBatch(a.batchId, approve, note);
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            Monthly import · {a.period}{" "}
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {a.stepName} (step {a.stepIndex + 1} of {a.totalSteps})
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Submitted by {a.submittedBy ?? "—"} · {new Date(a.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold tabular-nums">{money(a.totalContribution)}</p>
          <p className="text-xs text-muted-foreground">
            {a.willApply} to credit{a.alreadyImported ? ` · ${a.alreadyImported} skipped` : ""}
            {a.errors ? ` · ${a.errors} errors` : ""}
          </p>
        </div>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-primary hover:underline"
      >
        {open ? "Hide" : "Review"} impact ({a.rows.length} rows)
      </button>

      {open && (
        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium text-right">Current</th>
                <th className="px-3 py-2 font-medium text-right">Contribution</th>
                <th className="px-3 py-2 font-medium text-right">New balance</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {a.rows.map((r, i) => {
                const badge = STATUS_BADGE[r.status];
                return (
                  <tr key={i} className={cn(r.status === "error" && "bg-destructive/5")}>
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{r.name ?? "—"}</span>{" "}
                      <span className="text-xs text-muted-foreground">#{r.empNum}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {r.currentBalance != null ? money(r.currentBalance) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.status === "error" ? "—" : money(r.amount)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                      {r.newBalance != null ? money(r.newBalance) : "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", badge.cls)}>{badge.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(false)}>
          <X className="h-3.5 w-3.5" /> Reject
        </Button>
        <Button size="sm" disabled={pending} onClick={() => decide(true)}>
          <Check className="h-3.5 w-3.5" /> {a.stepIndex + 1 === a.totalSteps ? "Approve & commit" : "Approve"}
        </Button>
      </div>
    </div>
  );
}
