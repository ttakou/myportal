"use client";

import { useState, useTransition } from "react";
import { Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TRIP_STATUS_LABEL, type Trip, type TripStatus } from "@/types/trips";
import {
  addTripExpense,
  createTrip,
  financeApproveTrip,
  managerApproveTrip,
  rejectTrip,
  submitTrip,
} from "../actions";

const STATUS_STYLE: Record<TripStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-accent text-accent-foreground",
  manager_approved: "bg-primary/10 text-primary",
  finance_approved: "bg-green-100 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
  completed: "bg-green-100 text-green-700",
};

const money = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

export function TripsBoard({
  mine,
  queue,
  isAdmin,
}: {
  mine: Trip[];
  queue: Trip[];
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState("");
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [cost, setCost] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              createTrip({
                destination,
                purpose,
                departDate,
                returnDate,
                estimatedCost: Number(cost),
              }),
            () => {
              setDestination("");
              setPurpose("");
              setDepartDate("");
              setReturnDate("");
              setCost("");
            },
          );
        }}
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destination" required className="rounded-md border bg-background px-3 py-2 text-sm" />
        <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose" className="rounded-md border bg-background px-3 py-2 text-sm" />
        <input value={cost} onChange={(e) => setCost(e.target.value)} type="number" min={0} step="0.01" placeholder="Estimated cost (USD)" className="rounded-md border bg-background px-3 py-2 text-sm" />
        <label className="text-xs text-muted-foreground">Depart<input value={departDate} onChange={(e) => setDepartDate(e.target.value)} type="date" required className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" /></label>
        <label className="text-xs text-muted-foreground">Return<input value={returnDate} onChange={(e) => setReturnDate(e.target.value)} type="date" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" /></label>
        <Button type="submit" disabled={pending} className="self-end"><Plane className="h-4 w-4" /> New trip</Button>
      </form>

      {(isAdmin || queue.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Approvals</h2>
          <div className="space-y-2">
            {queue.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div>
                  <p className="font-medium">{t.destination} <span className="text-xs font-normal text-muted-foreground">· {t.requester_name} · {money(t.estimated_cost)}</span></p>
                  <p className="text-xs text-muted-foreground">{t.depart_date}{t.return_date ? ` → ${t.return_date}` : ""}{t.purpose ? ` · ${t.purpose}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge status={t.status} />
                  {t.status === "submitted" && (
                    <Button size="sm" disabled={pending} onClick={() => run(() => managerApproveTrip(t.id))}>Approve (mgr)</Button>
                  )}
                  {t.status === "manager_approved" && isAdmin && (
                    <Button size="sm" disabled={pending} onClick={() => run(() => financeApproveTrip(t.id))}>Approve (finance)</Button>
                  )}
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => { const r = window.prompt("Reason for rejection") ?? ""; run(() => rejectTrip(t.id, r)); }}>Reject</Button>
                </div>
              </div>
            ))}
            {queue.length === 0 && <p className="text-sm text-muted-foreground">Nothing awaiting your approval.</p>}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My trips</h2>
        <div className="space-y-3">
          {mine.map((t) => (
            <TripCard key={t.id} trip={t} pending={pending} run={run} />
          ))}
          {mine.length === 0 && <p className="text-sm text-muted-foreground">No trips yet.</p>}
        </div>
      </section>
    </div>
  );
}

function Badge({ status }: { status: TripStatus }) {
  return <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLE[status])}>{TRIP_STATUS_LABEL[status]}</span>;
}

function TripCard({
  trip,
  pending,
  run,
}: {
  trip: Trip;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [cat, setCat] = useState("");
  const [amt, setAmt] = useState("");
  const reconciled = trip.expense_total - trip.estimated_cost;
  const canExpense = trip.status === "finance_approved" || trip.status === "completed";

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{trip.destination}</p>
          <p className="text-xs text-muted-foreground">
            {trip.depart_date}{trip.return_date ? ` → ${trip.return_date}` : ""}
            {trip.purpose ? ` · ${trip.purpose}` : ""} · est. {money(trip.estimated_cost)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge status={trip.status} />
          {trip.status === "draft" && (
            <Button size="sm" disabled={pending} onClick={() => run(() => submitTrip(trip.id))}>Submit</Button>
          )}
        </div>
      </div>

      {trip.status === "rejected" && trip.rejection_reason && (
        <p className="mt-2 text-sm text-destructive">Rejected: {trip.rejection_reason}</p>
      )}

      {(trip.expenses.length > 0 || canExpense) && (
        <div className="mt-3 rounded-md bg-muted/40 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Expense reconciliation
          </p>
          {trip.expenses.map((e) => (
            <div key={e.id} className="flex justify-between text-sm">
              <span>{e.category}{e.note ? ` — ${e.note}` : ""}</span>
              <span className="tabular-nums">{money(e.amount)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t pt-1 text-sm font-medium">
            <span>Actual / Estimate</span>
            <span className="tabular-nums">
              {money(trip.expense_total)} / {money(trip.estimated_cost)}{" "}
              <span className={cn(reconciled > 0 ? "text-destructive" : "text-green-600")}>
                ({reconciled > 0 ? "+" : ""}{money(reconciled)})
              </span>
            </span>
          </div>
          {canExpense && (
            <div className="mt-2 flex flex-wrap gap-2">
              <input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Category" className="rounded-md border bg-background px-2 py-1 text-sm" />
              <input value={amt} onChange={(e) => setAmt(e.target.value)} type="number" min={0} step="0.01" placeholder="Amount" className="w-28 rounded-md border bg-background px-2 py-1 text-sm" />
              <Button size="sm" variant="outline" disabled={pending || !cat.trim()} onClick={() => run(() => addTripExpense({ tripId: trip.id, category: cat, amount: Number(amt) }), () => { setCat(""); setAmt(""); })}>Add expense</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
