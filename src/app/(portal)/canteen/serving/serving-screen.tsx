"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, ScanLine, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Reservation } from "@/types/canteen";
import { setReservationCollected } from "../campboss/actions";

export function ServingScreen({ reservations }: { reservations: Reservation[] }) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [code, setCode] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);

  const served = reservations.filter((r) => r.collected_at).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? reservations.filter(
          (r) =>
            (r.person_name ?? "").toLowerCase().includes(q) ||
            r.person_email.toLowerCase().includes(q),
        )
      : reservations;
    // Uncollected first, then collected.
    return [...rows].sort(
      (a, b) => Number(!!a.collected_at) - Number(!!b.collected_at),
    );
  }, [reservations, query]);

  function collect(r: Reservation) {
    if (r.collected_at) return;
    setFlash(null);
    startTransition(async () => {
      const res = await setReservationCollected(r.booking_id, true);
      setFlash(
        res.ok
          ? { ok: true, msg: `Collected: ${r.person_name ?? r.person_email}` }
          : { ok: false, msg: res.error ?? "Failed." },
      );
    });
  }

  function scan(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toLowerCase();
    if (!c) return;
    // Match a QR/badge payload: full booking id, or employee email/name.
    const match = reservations.find(
      (r) =>
        r.booking_id.toLowerCase() === c ||
        r.person_email.toLowerCase() === c ||
        (r.person_name ?? "").toLowerCase() === c,
    );
    setCode("");
    if (!match) {
      setFlash({ ok: false, msg: `No reservation found for "${code}"` });
      return;
    }
    if (match.collected_at) {
      setFlash({ ok: false, msg: `${match.person_name ?? match.person_email} already collected` });
      return;
    }
    collect(match);
  }

  return (
    <div className="space-y-6">
      {/* Live counters */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Counter label="Reservations" value={reservations.length} />
        <Counter label="Served" value={served} tone="green" />
        <Counter label="Remaining" value={reservations.length - served} tone="amber" />
      </div>

      {/* Scan / badge input (works with keyboard-wedge QR/badge scanners) */}
      <form onSubmit={scan} className="flex gap-2 rounded-lg border bg-card p-4">
        <div className="relative flex-1">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            placeholder="Scan QR / badge or type employee email, then Enter"
            className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <Button type="submit" disabled={pending}>Validate</Button>
      </form>

      {flash && (
        <p
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium",
            flash.ok ? "bg-green-100 text-green-700" : "bg-destructive/10 text-destructive",
          )}
        >
          {flash.msg}
        </p>
      )}

      {/* Search + list */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search employee name…"
          className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Meal</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => {
              const collected = !!r.collected_at;
              return (
                <tr key={r.booking_id} className={cn(collected && "bg-green-50")}>
                  <td className="px-4 py-3 font-medium">{r.person_name || r.person_email}</td>
                  <td className="px-4 py-3">
                    {r.kitchen_name} · {r.dish_name}
                    {r.options && <span className="text-muted-foreground"> — {r.options}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {collected ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
                        <CheckCircle2 className="h-4 w-4" /> Collected
                      </span>
                    ) : (
                      <Button size="sm" disabled={pending} onClick={() => collect(r)}>
                        Mark collected
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No reservations.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-3xl font-semibold tabular-nums",
          tone === "green" && "text-green-700",
          tone === "amber" && "text-amber-600",
        )}
      >
        {value}
      </p>
    </div>
  );
}
