"use client";

import { useMemo, useState } from "react";
import { TrendingUp, Target, CalendarClock, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { money } from "@/types/savings";

// --- Time-value-of-money engine -------------------------------------------
// Monthly compounding at rate r, level monthly contribution P, opening balance B.

/** Future value after n whole months. */
function futureValue(B: number, P: number, r: number, n: number): number {
  if (n <= 0) return B;
  if (r === 0) return B + P * n;
  const g = Math.pow(1 + r, n);
  return B * g + P * ((g - 1) / r);
}

/** Monthly contribution needed to reach target T in n months. */
function requiredContribution(B: number, T: number, r: number, n: number): number {
  if (n <= 0) return Infinity;
  if (r === 0) return (T - B) / n;
  const g = Math.pow(1 + r, n);
  return (T - B * g) / ((g - 1) / r);
}

/** Whole months to grow from B to T given contribution P (Infinity if never). */
function monthsToTarget(B: number, T: number, r: number, P: number): number {
  if (T <= B) return 0;
  if (r === 0) return P > 0 ? Math.ceil((T - B) / P) : Infinity;
  const denom = B * r + P;
  const numer = T * r + P;
  if (denom <= 0 || numer <= 0) return Infinity;
  const n = Math.log(numer / denom) / Math.log(1 + r);
  return n > 0 && Number.isFinite(n) ? Math.ceil(n) : Infinity;
}

function monthsBetween(fromYear: number, fromMonth: number, toIso: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(toIso);
  if (!m) return 0;
  const ty = Number(m[1]);
  const tm = Number(m[2]);
  return Math.max(0, (ty - fromYear) * 12 + (tm - fromMonth));
}

function addMonthsLabel(months: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

type Basis = "current" | "avg12" | "custom";
type Mode = "project" | "goal" | "time";

export function SavingsForecast({
  balance,
  monthlyThisMonth,
  monthlyAvg12,
  annualRatePct,
}: {
  balance: number;
  monthlyThisMonth: number;
  monthlyAvg12: number;
  annualRatePct: number;
}) {
  const r = annualRatePct / 100 / 12;
  const [mode, setMode] = useState<Mode>("project");
  const [basis, setBasis] = useState<Basis>(monthlyThisMonth > 0 ? "current" : "avg12");
  const [custom, setCustom] = useState("");

  // Default target date: one year out.
  const now = new Date();
  const defaultDate = new Date(now.getFullYear() + 1, now.getMonth(), 1).toISOString().slice(0, 10);
  const [date, setDate] = useState(defaultDate);
  const [goal, setGoal] = useState("");
  const [timeTarget, setTimeTarget] = useState("");

  const P =
    basis === "current" ? monthlyThisMonth : basis === "avg12" ? monthlyAvg12 : Math.max(0, Number(custom) || 0);

  const nMonths = monthsBetween(now.getFullYear(), now.getMonth() + 1, date);

  // Projection series for the chart (cap at 600 months).
  const series = useMemo(() => {
    const cap = Math.min(Math.max(nMonths, 12), 600);
    const pts: { m: number; bal: number; contrib: number }[] = [];
    for (let m = 0; m <= cap; m++) {
      pts.push({ m, bal: futureValue(balance, P, r, m), contrib: balance + P * m });
    }
    return pts;
  }, [balance, P, r, nMonths]);

  const projected = futureValue(balance, P, r, nMonths);
  const contributed = balance + P * nMonths;
  const interestEarned = Math.max(0, projected - contributed);

  // Goal mode
  const goalAmt = Math.max(0, Number(goal) || 0);
  const neededP = goalAmt > 0 ? requiredContribution(balance, goalAmt, r, nMonths) : 0;
  const increase = neededP - P;

  // Time mode
  const tAmt = Math.max(0, Number(timeTarget) || 0);
  const tMonths = tAmt > 0 ? monthsToTarget(balance, tAmt, r, P) : 0;

  const basisLabel =
    basis === "current" ? "this month" : basis === "avg12" ? "avg of last 12 months" : "custom amount";

  return (
    <div className="space-y-5">
      {/* Snapshot */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Current balance" value={money(balance)} />
        <Stat label="Monthly contribution" value={money(P)} sub={`Using ${basisLabel}`} />
        <Stat label="Interest rate" value={`${annualRatePct}%`} sub="per year, compounded monthly" />
      </div>

      {/* Contribution basis */}
      <div className="rounded-lg border bg-card p-4">
        <p className="mb-2 text-sm font-medium">Assume I contribute…</p>
        <div className="flex flex-wrap items-center gap-2">
          <Choice active={basis === "current"} onClick={() => setBasis("current")}>
            This month · {money(monthlyThisMonth)}
          </Choice>
          <Choice active={basis === "avg12"} onClick={() => setBasis("avg12")}>
            Avg last 12 months · {money(monthlyAvg12)}
          </Choice>
          <Choice active={basis === "custom"} onClick={() => setBasis("custom")}>
            Custom
          </Choice>
          {basis === "custom" && (
            <input
              type="number"
              min={0}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Amount / month (XAF)"
              className="w-44 rounded-md border bg-background px-3 py-1.5 text-sm"
            />
          )}
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex flex-wrap gap-2">
        <Tab active={mode === "project"} onClick={() => setMode("project")} icon={<TrendingUp className="h-4 w-4" />}>
          Project to a date
        </Tab>
        <Tab active={mode === "goal"} onClick={() => setMode("goal")} icon={<Target className="h-4 w-4" />}>
          Reach a goal by a date
        </Tab>
        <Tab active={mode === "time"} onClick={() => setMode("time")} icon={<CalendarClock className="h-4 w-4" />}>
          When will I reach an amount
        </Tab>
      </div>

      {/* Mode bodies */}
      {mode === "project" && (
        <div className="space-y-4 rounded-lg border bg-card p-4">
          <label className="text-sm">
            <span className="mr-2 text-muted-foreground">Target date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-sm" />
            <span className="ml-2 text-muted-foreground">({nMonths} month{nMonths === 1 ? "" : "s"} away)</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={`Projected total by ${addMonthsLabel(nMonths)}`} value={money(projected)} strong />
            <Stat label="Of which your contributions" value={money(contributed)} />
            <Stat label="Of which interest earned" value={money(interestEarned)} tone="green" />
          </div>
          <ProjectionChart series={series} highlight={nMonths} />
          <Milestones balance={balance} P={P} r={r} />
        </div>
      )}

      {mode === "goal" && (
        <div className="space-y-4 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mr-2 text-muted-foreground">I want a total of</span>
              <input type="number" min={0} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Target (XAF)" className="w-44 rounded-md border bg-background px-3 py-1.5 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mr-2 text-muted-foreground">by</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-sm" />
            </label>
          </div>
          {goalAmt > 0 && nMonths > 0 ? (
            neededP <= 0 ? (
              <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                Your current balance alone already reaches {money(goalAmt)} by {addMonthsLabel(nMonths)} with interest —
                no further contributions needed.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Required monthly contribution" value={money(Math.ceil(neededP))} strong />
                <Stat
                  label={increase > 0 ? "Increase needed vs now" : "Spare room vs now"}
                  value={`${increase > 0 ? "+" : ""}${money(Math.round(increase))}`}
                  tone={increase > 0 ? "red" : "green"}
                />
                <Stat label="Months to target" value={String(nMonths)} />
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Enter a target amount and a future date.</p>
          )}
        </div>
      )}

      {mode === "time" && (
        <div className="space-y-4 rounded-lg border bg-card p-4">
          <label className="text-sm">
            <span className="mr-2 text-muted-foreground">When will my total reach</span>
            <input type="number" min={0} value={timeTarget} onChange={(e) => setTimeTarget(e.target.value)} placeholder="Amount (XAF)" className="w-44 rounded-md border bg-background px-3 py-1.5 text-sm" />
          </label>
          {tAmt > 0 ? (
            tAmt <= balance ? (
              <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">You&apos;re already there — your balance is {money(balance)}.</p>
            ) : tMonths === Infinity ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                With a {money(P)}/month contribution and {annualRatePct}% interest, this target isn&apos;t reached —
                increase your monthly contribution.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Time to reach" value={`${tMonths} month${tMonths === 1 ? "" : "s"}`} strong />
                <Stat label="Around" value={addMonthsLabel(tMonths)} />
                <Stat label="≈ years" value={(tMonths / 12).toFixed(1)} />
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Enter a target amount.</p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Projections assume a constant {money(P)}/month contribution, a constant {annualRatePct}% annual rate
        (compounded monthly) and no withdrawals. Actual results will vary.
      </p>
    </div>
  );
}

function Milestones({ balance, P, r }: { balance: number; P: number; r: number }) {
  const targets = [1_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000].filter((t) => t > balance);
  const rows = targets
    .map((t) => ({ t, m: monthsToTarget(balance, t, r, P) }))
    .filter((x) => x.m !== Infinity)
    .slice(0, 4);
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Milestones</p>
      <div className="flex flex-wrap gap-2 text-sm">
        {rows.map((x) => (
          <span key={x.t} className="rounded-full border px-2.5 py-1">
            {money(x.t)} → <span className="font-medium">{addMonthsLabel(x.m)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ProjectionChart({ series, highlight }: { series: { m: number; bal: number; contrib: number }[]; highlight: number }) {
  const W = 640;
  const H = 160;
  const pad = 4;
  const maxM = series[series.length - 1].m || 1;
  const maxV = Math.max(...series.map((p) => p.bal), 1);
  const x = (m: number) => pad + (m / maxM) * (W - 2 * pad);
  const y = (v: number) => H - pad - (v / maxV) * (H - 2 * pad);
  const line = (key: "bal" | "contrib") => series.map((p) => `${x(p.m).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const hx = x(Math.min(highlight, maxM));
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><LineChart className="h-3.5 w-3.5 text-primary" /> Total (with interest)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-neutral-400" /> Contributions only</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md border bg-background" preserveAspectRatio="none">
        <polyline points={line("contrib")} fill="none" stroke="#a3a3a3" strokeWidth="1.5" strokeDasharray="4 3" />
        <polyline points={line("bal")} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />
        {highlight > 0 && highlight <= maxM && <line x1={hx} y1={pad} x2={hx} y2={H - pad} stroke="hsl(var(--primary))" strokeWidth="1" strokeDasharray="3 3" opacity={0.5} />}
      </svg>
    </div>
  );
}

function Stat({ label, value, sub, strong, tone }: { label: string; value: string; sub?: string; strong?: boolean; tone?: "green" | "red" }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums", strong ? "text-xl font-semibold" : "text-base font-medium", tone === "green" && "text-green-600", tone === "red" && "text-destructive")}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-full px-3 py-1.5 text-sm font-medium", active ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-accent")}
    >
      {children}
    </button>
  );
}

function Tab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", active ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-accent")}
    >
      {icon}
      {children}
    </button>
  );
}
