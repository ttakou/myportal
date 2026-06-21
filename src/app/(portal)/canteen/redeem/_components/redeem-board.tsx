"use client";

import { useMemo, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Check, Search, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import { cn } from "@/lib/utils";
import type { MealRedemptionRow } from "@/types/canteen";
import { redeemMeal, undoMeal } from "../actions";

type Result = { ok: boolean; error?: string };

function personLabel(name: string | null, email: string): string {
  return name?.trim() ? name : email;
}

export function RedeemBoard({
  board,
  serviceDate,
}: {
  board: MealRedemptionRow[];
  serviceDate: string;
}) {
  const [pending, startTransition] = useStatusTransition("Redeeming…");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  function run(fn: () => Promise<Result>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
    });
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return board;
    return board.filter(
      (r) =>
        personLabel(r.full_name, r.email).toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q),
    );
  }, [board, query]);

  const served = board.reduce((n, r) => n + r.used, 0);
  const entitled = board.reduce((n, r) => n + r.effective, 0);

  const { count, hasMore, remaining, showMore, sentinelRef } = useProgressiveReveal(rows.length, {
    resetKey: query,
  });

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee…"
            className="w-full rounded-md border bg-background py-2 pl-8 pr-3 text-sm"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {served} served · {entitled} entitled
        </p>
      </div>

      {board.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No entitled employees for this day.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Taken / entitled</th>
                <th className="px-4 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.slice(0, count).map((r) => {
                const exhausted = r.remaining <= 0;
                return (
                  <tr key={r.profile_id} className={cn(exhausted && "bg-muted/30")}>
                    <td className="px-4 py-2">
                      <div className="font-medium">{personLabel(r.full_name, r.email)}</div>
                      {r.job_title && (
                        <div className="text-xs text-muted-foreground">{r.job_title}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-medium",
                          r.used >= r.effective && r.effective > 0
                            ? "bg-green-100 text-green-700"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {r.used} / {r.effective}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-2">
                        {r.used > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => run(() => undoMeal(r.profile_id, serviceDate))}
                          >
                            <Undo2 className="h-4 w-4" /> Undo
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending || exhausted}
                          onClick={() => run(() => redeemMeal(r.profile_id, serviceDate))}
                        >
                          <Check className="h-4 w-4" /> Serve
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ShowMore
            ref={sentinelRef}
            hasMore={hasMore}
            remaining={remaining}
            onClick={showMore}
            label="Show more employees"
          />
        </div>
      )}
    </div>
  );
}
