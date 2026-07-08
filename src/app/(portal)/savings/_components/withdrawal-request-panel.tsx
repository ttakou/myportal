"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, type WithdrawalRequest, type WithdrawalStatus } from "@/types/savings";
import { requestWithdrawal } from "../actions";

const STATUS_STYLE: Record<WithdrawalStatus, string> = {
  requested: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  rejected: "bg-destructive/10 text-destructive",
  released: "bg-green-100 text-green-700",
};
const STATUS_LABEL: Record<WithdrawalStatus, string> = {
  requested: "Awaiting approval",
  approved: "Approved · awaiting funds",
  rejected: "Declined",
  released: "Released",
};

export function WithdrawalRequestPanel({
  balance,
  requests,
}: {
  balance: number;
  requests: WithdrawalRequest[];
}) {
  const [pending, startTransition] = useStatusTransition("Submitting…");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const hasOpen = requests.some((r) => r.status === "requested" || r.status === "approved");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    startTransition(async () => {
      const res = await requestWithdrawal({ amount: Number(amount), reason });
      if (!res.ok) {
        setError(res.error ?? "Could not submit request.");
        return;
      }
      setOk(true);
      setAmount("");
      setReason("");
    });
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2">
        <Banknote className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Request a withdrawal</h2>
      </div>

      {hasOpen ? (
        <p className="text-sm text-muted-foreground">
          You have a withdrawal request in progress. You can raise a new one once it&apos;s released
          or declined.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {ok && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              Request submitted — finance will review it.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              min={0}
              step="1"
              placeholder="Amount (XAF)"
              required
              className="w-44 rounded-md border bg-background px-3 py-2 text-sm"
            />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Available: {money(balance)}</span>
            <Button type="submit" size="sm" disabled={pending || !amount}>
              {pending ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </form>
      )}

      {requests.length > 0 && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-sm font-medium">My withdrawal requests</p>
          <ul className="space-y-1.5">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="tabular-nums font-medium">{money(r.amount)}</span>
                <span className="flex-1 truncate text-muted-foreground">
                  {r.reason ?? "—"}
                  {r.decision_note ? ` · ${r.decision_note}` : ""}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
