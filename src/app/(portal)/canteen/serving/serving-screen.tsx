"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ScanLine, Search, UserPlus, Utensils, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { CanteenDish, EntitledPerson, Reservation } from "@/types/canteen";
import { setReservationCollected } from "../campboss/actions";
import {
  lookupWalkin,
  searchEmployees,
  serveWalkin,
  type EmployeeOption,
} from "./actions";

type WalkinPerson = { id: string; name: string; email: string; allowance: number };

export function ServingScreen({
  reservations,
  dishes,
  entitled,
}: {
  reservations: Reservation[];
  dishes: CanteenDish[];
  entitled: EntitledPerson[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [query, setQuery] = useState("");
  const [code, setCode] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);
  // When a scan/selection finds no booking but an entitled employee, we prompt
  // the staff to pick a dish and serve them as a walk-in.
  const [walkin, setWalkin] = useState<WalkinPerson | null>(null);
  // Visitors the campboss adds when activating a walk-in.
  const [walkinGuests, setWalkinGuests] = useState(0);
  // Typeahead suggestions for the validate box (search the employee directory).
  const [options, setOptions] = useState<EmployeeOption[]>([]);
  const [showOptions, setShowOptions] = useState(false);

  const served = reservations.filter((r) => r.collected_at).length;

  // Reset the visitor count whenever the walk-in target changes.
  useEffect(() => {
    setWalkinGuests(0);
  }, [walkin]);

  // Close the walk-in picker with Escape (it's a modal, so it stays in view
  // wherever the staff triggered it from — no scrolling back to the top).
  useEffect(() => {
    if (!walkin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWalkin(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walkin]);

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

  // Roster shows only those still to be served.
  const filteredEntitled = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entitled.filter(
      (p) =>
        !p.collected &&
        (!q || p.name.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q)),
    );
  }, [entitled, query]);
  const remaining = entitled.filter((p) => !p.collected);
  const remainingPlates = remaining.reduce((s, p) => s + p.plates, 0);
  const remainingVisitors = remaining.reduce((s, p) => s + p.guestCount, 0);
  const servedEntitled = entitled.length - remaining.length;

  // Debounced directory search as the staff type a name into the validate box.
  useEffect(() => {
    const q = code.trim();
    if (q.length < 2) {
      setOptions([]);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      const res = await searchEmployees(q);
      if (active) {
        setOptions(res);
        setShowOptions(true);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [code]);

  /** Find a today's reservation for this person (matched by email). */
  function reservationFor(email: string | null): Reservation | undefined {
    if (!email) return undefined;
    const e = email.toLowerCase();
    return reservations.find((r) => r.person_email.toLowerCase() === e);
  }

  function collect(r: Reservation) {
    if (r.collected_at) return;
    setFlash(null);
    startTransition(async () => {
      const res = await setReservationCollected(r.booking_id, true);
      if (res.ok) {
        setFlash({ ok: true, msg: `Collected: ${r.person_name ?? r.person_email}` });
        router.refresh();
      } else {
        setFlash({ ok: false, msg: res.error ?? "Failed." });
      }
    });
  }

  function collectById(bookingId: string, label: string) {
    setFlash(null);
    startTransition(async () => {
      const res = await setReservationCollected(bookingId, true);
      if (res.ok) {
        setFlash({ ok: true, msg: `Collected: ${label}` });
        router.refresh();
      } else {
        setFlash({ ok: false, msg: res.error ?? "Failed." });
      }
    });
  }

  /** Activate an entitled person: collect their booking, or open the walk-in picker. */
  function activateEntitled(p: EntitledPerson) {
    if (p.collected) return;
    setFlash(null);
    if (p.hasBooking && p.bookingId) {
      collectById(p.bookingId, p.name);
      return;
    }
    startTransition(async () => {
      const res = await lookupWalkin(p.profileId);
      if (res.ok && res.person) setWalkin(res.person);
      else setFlash({ ok: false, msg: res.error ?? "Not entitled." });
    });
  }

  /** Act on a chosen person: collect their booking, or open the walk-in picker. */
  function choosePerson(person: EmployeeOption) {
    setShowOptions(false);
    setOptions([]);
    setCode("");
    setFlash(null);
    const r = reservationFor(person.email);
    if (r) {
      if (r.collected_at) {
        setFlash({ ok: false, msg: `${person.name} already collected` });
        return;
      }
      collect(r);
      return;
    }
    // No booking — serve as a walk-in if entitled. Resolve by id (always
    // present; email can be missing) and let the server confirm entitlement.
    if (!person.lunch_eligible) {
      setFlash({ ok: false, msg: `${person.name} is not entitled to lunch. Contact HR.` });
      return;
    }
    startTransition(async () => {
      const res = await lookupWalkin(person.id);
      if (res.ok && res.person) setWalkin(res.person);
      else setFlash({ ok: false, msg: res.error ?? "Not entitled." });
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
    if (match) {
      setShowOptions(false);
      setCode("");
      if (match.collected_at) {
        setFlash({ ok: false, msg: `${match.person_name ?? match.person_email} already collected` });
        return;
      }
      collect(match);
      return;
    }
    // No booking — see if this is an entitled employee we can serve as a walk-in.
    setFlash(null);
    setWalkin(null);
    setShowOptions(false);
    startTransition(async () => {
      const res = await lookupWalkin(code.trim());
      setCode("");
      if (res.ok && res.person) {
        setWalkin(res.person);
      } else {
        setFlash({ ok: false, msg: res.error ?? `No reservation found for "${code}"` });
      }
    });
  }

  function serve(dish: CanteenDish) {
    if (!walkin) return;
    const person = walkin;
    setFlash(null);
    const guests = walkinGuests;
    startTransition(async () => {
      const res = await serveWalkin(person.id, dish.id, guests);
      if (res.ok) {
        setWalkin(null);
        setFlash({
          ok: true,
          msg: `Served (walk-in): ${res.served?.name ?? person.name} — ${res.served?.dish ?? dish.name}${guests > 0 ? ` (+${guests} visitor${guests === 1 ? "" : "s"})` : ""}`,
        });
        router.refresh();
      } else {
        setFlash({ ok: false, msg: res.error ?? "Failed." });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Live counters */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Counter label="Reservations" value={reservations.length} />
        <Counter label="Served" value={served} tone="green" />
        <Counter label="Remaining" value={reservations.length - served} tone="amber" />
      </div>

      {/* Scan / badge input + name typeahead (keyboard-wedge scanners still work) */}
      <form onSubmit={scan} className="flex gap-2 rounded-lg border bg-card p-4">
        <div className="relative flex-1">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onFocus={() => options.length > 0 && setShowOptions(true)}
            onBlur={() => setTimeout(() => setShowOptions(false), 150)}
            autoFocus
            autoComplete="off"
            placeholder="Scan QR / badge or type a name, then pick or press Enter"
            className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm"
          />
          {showOptions && options.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
              {options.map((o) => {
                const r = reservationFor(o.email);
                const badge = r
                  ? r.collected_at
                    ? { text: "Collected", cls: "text-green-700" }
                    : { text: r.kitchen_name + " · " + r.dish_name, cls: "text-muted-foreground" }
                  : o.lunch_eligible
                    ? { text: "Walk-in", cls: "text-primary" }
                    : { text: "Not entitled", cls: "text-destructive" };
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      // onMouseDown (not onClick) so it fires before the input's blur.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        choosePerson(o);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{o.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{o.email ?? "—"}</span>
                      </span>
                      <span className={cn("shrink-0 text-xs font-medium", badge.cls)}>{badge.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
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

      {/* Walk-in: entitled employee with no booking — pick a dish to serve. Shown
          as a centred modal so it appears in view wherever the staff triggered
          it (e.g. from a row far down the roster), with no scroll to the top. */}
      {walkin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setWalkin(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-lg border border-primary/40 bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">
                <UserPlus className="mr-1.5 inline h-4 w-4 align-text-bottom" />
                No booking for{" "}
                <span className="font-semibold">{walkin.name}</span> — serve a walk-in:
              </p>
              <button
                type="button"
                onClick={() => setWalkin(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Cancel walk-in"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Visitors</span>
              <input
                type="number"
                min={0}
                max={20}
                value={walkinGuests}
                onChange={(e) => setWalkinGuests(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
              />
              <span className="text-xs text-muted-foreground">
                {1 + walkinGuests} plate{walkinGuests === 0 ? "" : "s"}
                {" · entitled to "}
                {walkin.allowance} meal{walkin.allowance === 1 ? "" : "s"}/day
              </span>
            </label>
            {1 + walkinGuests > walkin.allowance && (
              <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {1 + walkinGuests - walkin.allowance} plate
                  {1 + walkinGuests - walkin.allowance === 1 ? "" : "s"} beyond{" "}
                  {walkin.name}&apos;s entitlement ({walkin.allowance} meal
                  {walkin.allowance === 1 ? "" : "s"}/day). Serving {1 + walkinGuests} in
                  total — the extra cover{1 + walkinGuests - walkin.allowance === 1 ? " is a" : "s are"}{" "}
                  visitor plate{1 + walkinGuests - walkin.allowance === 1 ? "" : "s"}.
                </span>
              </p>
            )}
            {dishes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No meals on today&apos;s menu to serve.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {dishes.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    disabled={pending}
                    onClick={() => serve(d)}
                    className="rounded-md border bg-background px-3 py-2 text-left text-sm hover:border-primary hover:bg-accent disabled:opacity-50"
                  >
                    <span className="block text-xs text-muted-foreground">{d.kitchen_name}</span>
                    <span className="font-medium">{d.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
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

      {/* Entitled roster: everyone allowed to eat today + their plate count, with
          one-tap walk-in activation for the campboss. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold">
            <Utensils className="h-4 w-4" /> Entitled to eat today
          </h2>
          <p className="text-sm text-muted-foreground">
            {remaining.length} to serve · <span className="font-medium text-foreground">{remainingPlates}</span> plates
            {remainingVisitors > 0 ? ` (incl. ${remainingVisitors} visitor${remainingVisitors === 1 ? "" : "s"})` : ""}
            {servedEntitled > 0 ? ` · ${servedEntitled} served` : ""}
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Plates</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredEntitled.map((p) => (
                <tr key={p.profileId} className={cn(p.collected && "bg-green-50")}>
                  <td className="px-4 py-3">
                    <span className="block font-medium">{p.name}</span>
                    {p.dishLabel && <span className="block text-xs text-muted-foreground">{p.dishLabel}</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {p.plates}
                    {p.guestCount > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">(+{p.guestCount} visitor{p.guestCount === 1 ? "" : "s"})</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.collected ? (
                      <span className="text-xs font-medium text-green-700">Served</span>
                    ) : p.hasBooking ? (
                      <span className="text-xs text-muted-foreground">Booked</span>
                    ) : (
                      <span className="text-xs text-primary">No booking</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.collected ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
                        <CheckCircle2 className="h-4 w-4" /> Done
                      </span>
                    ) : (
                      <Button size="sm" variant={p.hasBooking ? "default" : "outline"} disabled={pending} onClick={() => activateEntitled(p)}>
                        {p.hasBooking ? "Mark collected" : "Activate walk-in"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredEntitled.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  {entitled.length > 0 ? "Everyone entitled has been served." : "No entitled employees."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
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
