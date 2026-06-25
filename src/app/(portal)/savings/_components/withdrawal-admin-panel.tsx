"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Check, X, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, type WithdrawalRequest, type WithdrawalStatus } from "@/types/savings";
import { decideWithdrawal, releaseWithdrawal } from "../actions";

const STATUS_STYLE: Record<WithdrawalStatus, string> = {
  requested: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  rejected: "bg-destructive/10 text-destructive",
  released: "bg-green-100 text-green-700",
};

export function WithdrawalAdminPanel({ requests }: { requests: WithdrawalRequest[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      setBusyId(null);
    });
  }

  const open = requests.filter((r) => r.status === "requested" || r.status === "approved");
  const closed = requests.filter((r) => r.status === "rejected" || r.status === "released");

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Banknote className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Withdrawal requests</h2>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending withdrawal requests.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {open.map((r) => {
                const insufficient = r.account_balance != null && r.amount > r.account_balance;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">{r.person_name ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(r.amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {r.account_balance != null ? money(r.account_balance) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.reason ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                        {r.status === "requested" ? "Awaiting approval" : "Approved"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {r.status === "requested" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending && busyId === r.id}
                              onClick={() => run(r.id, () => decideWithdrawal(r.id, true))}
                            >
                              <Check className="h-3.5 w-3.5" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending && busyId === r.id}
                              onClick={() => {
                                const note = window.prompt("Reason for declining (optional):") ?? undefined;
                                run(r.id, () => decideWithdrawal(r.id, false, note));
                              }}
                            >
                              <X className="h-3.5 w-3.5" /> Decline
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            disabled={(pending && busyId === r.id) || insufficient}
                            title={insufficient ? "Balance is now lower than the requested amount" : undefined}
                            onClick={() => run(r.id, () => releaseWithdrawal(r.id))}
                          >
                            <Banknote className="h-3.5 w-3.5" /> Release funds
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {closed.length > 0 && (
        <details className="rounded-lg border bg-card">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
            History ({closed.length})
          </summary>
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {closed.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium">{r.person_name ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(r.amount)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.reason ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                        {r.status === "released" ? "Released" : "Declined"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
