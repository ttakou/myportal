"use client";

import { useMemo, useState } from "react";
import { TrendingUp, Target, CalendarClock, LineChart, Flag, Trash2 } from "lucide-react";
import { useStatusTransition } from "@/components/activity";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { money } from "@/types/savings";
import type { SavingsGoal } from "@/lib/savings";
import { futureValue, requiredContribution, monthsToTarget, monthsBetween } from "@/lib/savings-forecast";
import { clearSavingsGoal, setSavingsGoal } from "../actions";

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
  goal,
}: {
  balance: number;
  monthlyThisMonth: number;
  monthlyAvg12: number;
  annualRatePct: number;
  goal: SavingsGoal | null;
}) {
  const r = annualRatePct / 100 / 12;
  const [mode, setMode] = useState<Mode>("project");
  const [basis, setBasis] = useState<Basis>(monthlyThisMonth > 0 ? "current" : "avg12");
  const [custom, setCustom] = useState("");
  const [lump, setLump] = useState("");

  // Default target date: one year out.
  const now = new Date();
  const defaultDate = new Date(now.getFullYear() + 1, now.getMonth(), 1).toISOString().slice(0, 10);
  const [date, setDate] = useState(defaultDate);
  const [goalInput, setGoalInput] = useState("");
  const [timeTarget, setTimeTarget] = useState("");

  const P =
    basis === "current" ? monthlyThisMonth : basis === "avg12" ? monthlyAvg12 : Math.max(0, Number(custom) || 0);

  // One-off lump sum added now lifts the starting balance for every scenario.
  const lumpAmt = Math.max(0, Number(lump) || 0);
  const B = balance + lumpAmt;

  const nMonths = monthsBetween(now.getFullYear(), now.getMonth() + 1, date);

  // Projection series for the chart (cap at 600 months).
  const series = useMemo(() => {
    const cap = Math.min(Math.max(nMonths, 12), 600);
    const pts: { m: number; bal: number; contrib: number }[] = [];
    for (let m = 0; m <= cap; m++) {
      pts.push({ m, bal: futureValue(B, P, r, m), contrib: B + P * m });
    }
    return pts;
  }, [B, P, r, nMonths]);

  const projected = futureValue(B, P, r, nMonths);
  const contributed = B + P * nMonths;
  const interestEarned = Math.max(0, projected - contributed);

  // Goal mode
  const goalAmt = Math.max(0, Number(goalInput) || 0);
  const neededP = goalAmt > 0 ? requiredContribution(B, goalAmt, r, nMonths) : 0;
  const increase = neededP - P;

  // Time mode
  const tAmt = Math.max(0, Number(timeTarget) || 0);
  const tMonths = tAmt > 0 ? monthsToTarget(B, tAmt, r, P) : 0;

  const basisLabel =
    basis === "current" ? "this month" : basis === "avg12" ? "avg of last 12 months" : "custom amount";

  return (
    <div className="space-y-5">
      <GoalPanel goal={goal} B={B} P={P} r={r} />

      {/* Snapshot */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Current balance" value={money(balance)} sub={lumpAmt > 0 ? `+ ${money(lumpAmt)} lump = ${money(B)}` : undefined} />
        <Stat label="Monthly contribution" value={money(P)} sub={`Using ${basisLabel}`} />
        <Stat label="Interest rate" value={`${annualRatePct}%`} sub="per year, compounded monthly" />
      </div>

      {/* Contribution basis + lump sum */}
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
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-sm text-muted-foreground">Add a one-off lump sum now</span>
          <input
            type="number"
            min={0}
            value={lump}
            onChange={(e) => setLump(e.target.value)}
            placeholder="Lump sum (XAF)"
            className="w-44 rounded-md border bg-background px-3 py-1.5 text-sm"
          />
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
          <Milestones balance={B} P={P} r={r} />
        </div>
      )}

      {mode === "goal" && (
        <div className="space-y-4 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mr-2 text-muted-foreground">I want a total of</span>
              <input type="number" min={0} value={goalInput} onChange={(e) => setGoalInput(e.target.value)} placeholder="Target (XAF)" className="w-44 rounded-md border bg-background px-3 py-1.5 text-sm" />
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
            tAmt <= B ? (
              <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">You&apos;re already there — your balance is {money(B)}.</p>
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

function GoalPanel({ goal, B, P, r }: { goal: SavingsGoal | null; B: number; P: number; r: number }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(!goal);
  const now = new Date();
  const [amount, setAmount] = useState(goal ? String(goal.targetAmount) : "");
  const [date, setDate] = useState(
    goal?.targetDate ?? new Date(now.getFullYear() + 1, now.getMonth(), 1).toISOString().slice(0, 10),
  );

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await setSavingsGoal({ targetAmount: Math.max(0, Number(amount) || 0), targetDate: date });
      if (!res.ok) setError(res.error ?? "Could not save goal.");
      else setEditing(false);
    });
  }
  function clear() {
    setError(null);
    startTransition(async () => {
      await clearSavingsGoal();
    });
  }

  // Progress against a saved goal, projected at the chosen contribution pace.
  let body: React.ReactNode = null;
  if (goal && !editing) {
    const n = monthsBetween(now.getFullYear(), now.getMonth() + 1, goal.targetDate);
    const projected = futureValue(B, P, r, n);
    const onTrack = projected >= goal.targetAmount;
    const pct = Math.min(100, Math.round((B / goal.targetAmount) * 100));
    const requiredP = requiredContribution(B, goal.targetAmount, r, n);
    const shortfall = Math.max(0, goal.targetAmount - projected);
    body = (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            Target <span className="font-semibold">{money(goal.targetAmount)}</span> by{" "}
            <span className="font-semibold">{goal.targetDate}</span> ({n} month{n === 1 ? "" : "s"})
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing(true)}>Edit</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={clear}>
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">{pct}% of target saved ({money(B)}).</p>
        {onTrack ? (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            On track — at {money(P)}/month you reach {money(Math.round(projected))} by {goal.targetDate}.
          </p>
        ) : (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Behind by {money(Math.round(shortfall))}. Increase to{" "}
            <span className="font-semibold">{money(Math.ceil(requiredP))}/month</span> (
            {money(Math.round(Math.max(0, requiredP - P)))} more) to stay on track.
          </p>
        )}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mr-1 text-muted-foreground">I want</span>
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Target (XAF)" className="w-40 rounded-md border bg-background px-3 py-1.5 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mr-1 text-muted-foreground">by</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-sm" />
        </label>
        <Button size="sm" disabled={pending || !(Number(amount) > 0)} onClick={save}>
          {pending ? "Saving…" : "Save goal"}
        </Button>
        {goal && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setEditing(false)}>Cancel</Button>
        )}
      </div>
    );
  }

  return (
    <section className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <Flag className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">My savings goal</h2>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {body}
    </section>
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
