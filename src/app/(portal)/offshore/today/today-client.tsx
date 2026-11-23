"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { decideMovementChange, setPaxBoarded, togglePaxNoShow } from "../actions";
import type { TodayPax } from "@/lib/offshore/today-run";

/** Approve or reject a date change in place (the OIM's decision is final). */
export function MoveDecision({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const decide = (approve: boolean) => {
    let comment: string | undefined;
    if (!approve) {
      const why = window.prompt(`Reject ${name}'s date change — say why:`);
      if (!why?.trim()) return;
      comment = why.trim();
    } else if (!window.confirm(`Approve ${name}'s date change? Tonight's run will carry it out.`)) {
      return;
    }
    setError(null);
    start(async () => {
      const res = await decideMovementChange(id, approve, comment);
      if (!res.ok) setError(res.error ?? "Could not save.");
      else router.refresh();
    });
  };
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => decide(true)}
        className="inline-flex items-center gap-1 rounded border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 hover:bg-green-100"
      >
        <Check className="h-3 w-3" /> Approve
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide(false)}
        className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-3 w-3" /> Reject
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

/** Tick each passenger off as they board; mark a no-show. */
export function PaxTicks({ pax, canTick }: { pax: TodayPax[]; canTick: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(pax);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = rows.filter((p) => p.boarded).length;
  const missing = rows.filter((p) => p.no_show).length;

  const update = (id: string, patch: Partial<TodayPax>, call: () => Promise<{ ok: boolean; error?: string }>) => {
    const before = rows;
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setError(null);
    start(async () => {
      const res = await call();
      if (!res.ok) {
        setRows(before);
        setError(res.error ?? "Could not save.");
      } else router.refresh();
    });
  };

  if (rows.length === 0) return <p className="px-3 py-2 text-xs text-muted-foreground">Nobody on this manifest.</p>;
  return (
    <div>
      <p className="px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{done}</span> of {rows.length} ticked
        {missing > 0 && <span className="text-destructive"> · {missing} no-show</span>}
        {error && <span className="ml-2 text-destructive">{error}</span>}
      </p>
      <ul className="divide-y">
        {rows.map((p) => (
          <li key={p.id} className={cn("flex items-center gap-2 px-3 py-1.5 text-sm", p.no_show && "opacity-60")}>
            <label className="flex flex-1 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={p.boarded}
                disabled={!canTick || pending}
                onChange={(e) =>
                  update(p.id, { boarded: e.target.checked, no_show: e.target.checked ? false : p.no_show }, () =>
                    setPaxBoarded(p.id, e.target.checked),
                  )
                }
              />
              <span className={cn("font-medium", p.no_show && "line-through")}>{p.name}</span>
              {p.visitor && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">visitor</span>}
              {p.position && <span className="truncate text-xs text-muted-foreground">{p.position}</span>}
            </label>
            {canTick && !p.boarded && (
              <button
                type="button"
                disabled={pending}
                onClick={() => update(p.id, { no_show: !p.no_show }, () => togglePaxNoShow(p.id, !p.no_show))}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[11px]",
                  p.no_show ? "border-destructive/40 text-destructive" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {p.no_show ? "No-show ✓" : "No-show"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
