import { Scale, CheckCircle2, AlertTriangle } from "lucide-react";
import { money } from "@/types/savings";
import type { FundReconciliation } from "@/lib/savings";
import { cn } from "@/lib/utils";

/**
 * Read-only fund reconciliation: stored fund total vs an independent recompute
 * from the transaction ledger, with any drifting accounts flagged.
 */
export function FundReconciliationPanel({ data }: { data: FundReconciliation }) {
  const balanced = data.drift === 0 && data.driftRows.length === 0;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Scale className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Fund reconciliation</h2>
      </div>

      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
          balanced ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800",
        )}
      >
        {balanced ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        {balanced ? (
          <span>
            Balanced — the fund total matches the ledger across all {data.accountCount} account(s).
          </span>
        ) : (
          <span>
            Drift of {money(data.drift)} across {data.driftRows.length} account(s) — stored balances
            don&apos;t match the transaction ledger.
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Fund total (stored)" value={money(data.totalBalance)} strong />
        <Kpi label="Ledger total" value={money(data.computedTotal)} />
        <Kpi label="Contributions − interest in" value={money(data.totalContributions + data.totalInterest)} />
        <Kpi label="Withdrawals out" value={money(data.totalWithdrawals)} />
      </div>

      {data.driftRows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium text-right">Stored balance</th>
                <th className="px-4 py-3 font-medium text-right">Ledger balance</th>
                <th className="px-4 py-3 font-medium text-right">Drift</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.driftRows.map((r, i) => (
                <tr key={i} className="bg-amber-50/40">
                  <td className="px-4 py-2">
                    <span className="font-medium">{r.name ?? "—"}</span>
                    {r.empNum && <span className="ml-1 text-xs text-muted-foreground">#{r.empNum}</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(r.stored)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(r.computed)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-destructive">{money(r.drift)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums", strong ? "text-lg font-semibold" : "font-medium")}>{value}</p>
    </div>
  );
}
