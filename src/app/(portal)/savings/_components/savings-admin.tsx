"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, type AccountSummary, type WithdrawalRequest } from "@/types/savings";
import type { ImportBatchSummary } from "@/lib/savings";
import { ensureAccount, postTransaction, type SavingsImportStep } from "../actions";
import { SavingsImportPanel } from "./savings-import-panel";
import { WithdrawalAdminPanel } from "./withdrawal-admin-panel";
import { InterestPanel } from "./interest-panel";
import { ImportApprovalConfigPanel } from "./import-approval-config-panel";
import { ImportBatchesPanel } from "./import-batches-panel";

export function SavingsAdmin({
  accounts,
  users,
  withdrawals,
  annualRatePct,
  importSteps,
  batches,
}: {
  accounts: AccountSummary[];
  users: { id: string; name: string }[];
  withdrawals: WithdrawalRequest[];
  annualRatePct: number;
  importSteps: SavingsImportStep[];
  batches: ImportBatchSummary[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  const [newMember, setNewMember] = useState(users[0]?.id ?? "");
  const [acct, setAcct] = useState(accounts[0]?.id ?? "");
  const [kind, setKind] = useState<"contribution" | "withdrawal">("contribution");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <div className="space-y-6">
      <WithdrawalAdminPanel requests={withdrawals} />

      <InterestPanel annualRatePct={annualRatePct} />

      <ImportApprovalConfigPanel users={users} steps={importSteps} />

      <SavingsImportPanel approvalSteps={importSteps.length} />

      {batches.length > 0 && <ImportBatchesPanel batches={batches} />}

      <h2 className="text-lg font-semibold">Fund manager</h2>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Open account */}
        <div className="space-y-2 rounded-lg border bg-card p-4">
          <p className="text-sm font-medium">Open account</p>
          <select value={newMember} onChange={(e) => setNewMember(e.target.value)} className="w-full rounded-md border bg-background px-2 py-2 text-sm">
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <Button size="sm" disabled={pending} onClick={() => run(() => ensureAccount(newMember))}>
            <PiggyBank className="h-4 w-4" /> Create account
          </Button>
        </div>

        {/* Post transaction */}
        <div className="space-y-2 rounded-lg border bg-card p-4">
          <p className="text-sm font-medium">Post transaction</p>
          <select value={acct} onChange={(e) => setAcct(e.target.value)} className="w-full rounded-md border bg-background px-2 py-2 text-sm">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.person_name} · {money(a.balance)}</option>)}
          </select>
          <div className="flex gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as "contribution" | "withdrawal")} className="rounded-md border bg-background px-2 py-2 text-sm">
              <option value="contribution">Contribution</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={0} step="0.01" placeholder="Amount" className="w-28 rounded-md border bg-background px-2 py-2 text-sm" />
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-full rounded-md border bg-background px-2 py-2 text-sm" />
          <Button size="sm" disabled={pending || !acct} onClick={() => run(() => postTransaction({ accountId: acct, kind, amount: Number(amount), note }), () => { setAmount(""); setNote(""); })}>Post</Button>
        </div>
      </div>

      <section className="space-y-2">
        <p className="text-sm font-medium">Accounts</p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3 font-medium">Member</th><th className="px-4 py-3 font-medium text-right">Balance</th></tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-medium">{a.person_name ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(a.balance)}</td>
                </tr>
              ))}
              {accounts.length === 0 && <tr><td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">No accounts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
