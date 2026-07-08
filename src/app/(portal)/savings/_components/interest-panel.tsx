"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Percent, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/types/savings";
import { postMonthlyInterest, setSavingsAnnualRate, type InterestRunResult } from "../actions";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Configure the annual interest rate and run the monthly compounding accrual. */
export function InterestPanel({ annualRatePct }: { annualRatePct: number }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState(String(annualRatePct));
  const [savedRate, setSavedRate] = useState(annualRatePct);
  const [rateOk, setRateOk] = useState(false);
  const [period, setPeriod] = useState(currentMonth());
  const [result, setResult] = useState<InterestRunResult | null>(null);

  const monthlyPct = (savedRate / 12).toFixed(4);

  function saveRate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRateOk(false);
    startTransition(async () => {
      const res = await setSavingsAnnualRate(Number(rate));
      if (!res.ok) {
        setError(res.error ?? "Could not save rate.");
        return;
      }
      setSavedRate(Number(rate));
      setRateOk(true);
    });
  }

  function runAccrual() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await postMonthlyInterest({ period });
      if (!res.ok) {
        setError(res.error ?? "Could not run interest.");
        return;
      }
      setResult(res);
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Percent className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Interest</h2>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Rate config */}
        <form onSubmit={saveRate} className="space-y-2 rounded-lg border bg-card p-4">
          <p className="text-sm font-medium">Annual interest rate</p>
          <div className="flex items-center gap-2">
            <input
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              type="number"
              min={0}
              max={100}
              step="0.1"
              className="w-28 rounded-md border bg-background px-3 py-2 text-sm"
            />
            <span className="text-sm text-muted-foreground">% per year</span>
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              Save rate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Compounded monthly at {monthlyPct}% per month on the running balance.
          </p>
          {rateOk && <p className="text-xs text-green-700">Rate saved.</p>}
        </form>

        {/* Run accrual */}
        <div className="space-y-2 rounded-lg border bg-card p-4">
          <p className="text-sm font-medium">Run monthly interest</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-md border bg-background px-2 py-2 text-sm"
            />
            <Button size="sm" disabled={pending} onClick={runAccrual}>
              <Sparkles className="h-4 w-4" /> Accrue interest
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Credits each account {savedRate}%÷12 of its current balance. Safe to re-run — accounts
            already accrued for the month are skipped.
          </p>
          {result && (
            <p className="text-sm">
              <span className="font-medium text-green-700">{result.applied} credited</span>
              {result.skipped ? ` · ${result.skipped} skipped` : ""} ·{" "}
              {money(result.totalInterest ?? 0)} total interest for {result.period}.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
