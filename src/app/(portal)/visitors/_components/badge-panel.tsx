"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { BadgeCheck, IdCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { badgeBoard } from "@/lib/visitors/badges";
import type { Visitor, VisitorBadge } from "@/types/visitors";
import { addBadges, markBadgeReturned, setBadgeActive } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

/**
 * Reception's badge board: how many badges exist, which are out on whom,
 * which did not come back, and the pool itself (add a range, retire a
 * lost one). Check-in offers the free ones.
 */
export function BadgePanel({ badges, visitors }: { badges: VisitorBadge[]; visitors: Visitor[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [text, setText] = useState("");
  const onSite = visitors.filter((v) => v.status === "checked_in");
  const board = badgeBoard(badges, onSite);
  const notReturned = visitors.filter((v) => v.badge_returned === false);

  function run(fn: () => Promise<{ ok: boolean; error?: string; added?: number }>, onOk?: (r: { added?: number }) => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.(res);
    });
  }

  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium">
        <IdCard className="h-4 w-4 text-primary" /> Badges
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
          {board.out.length} out · {board.free.length} free · {board.total} in the pool
        </span>
        {notReturned.length > 0 && (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">{notReturned.length} not returned</span>
        )}
        {board.unlisted.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{board.unlisted.length} not in the pool</span>
        )}
      </summary>
      <div className="mt-3 space-y-4">
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {notice && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}

        {notReturned.length > 0 && (
          <section>
            <p className="text-xs font-medium uppercase tracking-wide text-destructive">Not returned</p>
            <ul className="mt-1 space-y-1 text-sm">
              {notReturned.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{v.badge_no ?? "?"}</span>
                  <span>
                    {v.full_name}
                    {v.company ? ` (${v.company})` : ""}
                  </span>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => markBadgeReturned(v.id))}>
                    <BadgeCheck className="h-3.5 w-3.5" /> Returned
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Out now</p>
          {board.out.length === 0 && board.unlisted.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No badge is out.</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1.5 text-xs">
              {board.out.map((o) => (
                <li key={o.number} className="rounded-full border bg-background px-2 py-0.5">
                  <span className="font-mono">{o.number}</span> · {o.holder.full_name}
                </li>
              ))}
              {board.unlisted.map((n) => (
                <li key={`u-${n}`} className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-900" title="Typed by hand; not a pool badge">
                  <span className="font-mono">{n}</span> · not in the pool
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pool</p>
          <form
            className="mt-1 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => addBadges(text),
                (r) => {
                  setText("");
                  setNotice(`${r.added ?? 0} badge(s) added.`);
                },
              );
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add badges: V001-V050, or a list" className={`${field} w-72`} required />
            <Button type="submit" variant="outline" disabled={pending}>
              Add
            </Button>
          </form>
          {badges.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">All badges ({badges.length})</summary>
              <ul className="mt-1 flex flex-wrap gap-1.5 text-xs">
                {badges.map((b) => (
                  <li key={b.id} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5", !b.is_active && "opacity-50 line-through")}>
                    <span className="font-mono">{b.number}</span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setBadgeActive(b.id, !b.is_active))}
                      className="text-muted-foreground hover:text-foreground"
                      title={b.is_active ? "Retire (lost or damaged)" : "Bring back into the pool"}
                    >
                      {b.is_active ? "retire" : "restore"}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>
    </details>
  );
}
