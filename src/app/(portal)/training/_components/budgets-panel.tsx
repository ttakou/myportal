"use client";

import { useState } from "react";
import { Wallet, Trash2 } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BudgetRow } from "@/lib/training";
import { deleteBudget, upsertBudget } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

export function BudgetsPanel({ budgets, scheduledCost }: { budgets: BudgetRow[]; scheduledCost: number }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [department, setDepartment] = useState("");
  const [amount, setAmount] = useState("");

  const total = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Failed.");
      else onOk?.();
    });
  }
  function reset() {
    setId("");
    setDepartment("");
    setAmount("");
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="h-5 w-5 text-primary" /> Budgets
        </h2>
        <p className="text-sm text-muted-foreground">Training budgets by year and department.</p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total budget</p>
          <p className="text-2xl font-semibold tabular-nums">{fmt(total)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Scheduled cost (committed)</p>
          <p className={cn("text-2xl font-semibold tabular-nums", scheduledCost > total && total > 0 && "text-destructive")}>{fmt(scheduledCost)}</p>
        </div>
      </div>

      <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-4">
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} placeholder="Year" className={field} />
        <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department (blank = org)" className={cn(field, "sm:col-span-2")} />
        <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className={field} />
        <div className="flex items-center gap-2 sm:col-span-4">
          <Button size="sm" disabled={pending || !year || !amount} onClick={() => run(() => upsertBudget({ id: id || undefined, budgetYear: year, department, amount: Number(amount) }), reset)}>
            {id ? "Save" : "Add budget"}
          </Button>
          {id && <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Year</th>
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {budgets.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="px-4 py-2 tabular-nums font-medium">{b.budget_year}</td>
                <td className="px-4 py-2 text-muted-foreground">{b.department ?? "Whole organisation"}</td>
                <td className="px-4 py-2 tabular-nums">{fmt(Number(b.amount))} {b.currency}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button disabled={pending} onClick={() => { setId(b.id); setYear(b.budget_year); setDepartment(b.department ?? ""); setAmount(String(b.amount)); }} className="text-xs text-primary hover:underline">Edit</button>
                    <button disabled={pending} title="Remove" onClick={() => run(() => deleteBudget(b.id))} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {budgets.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No budgets set.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
