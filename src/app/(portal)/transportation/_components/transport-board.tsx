"use client";

import { useState, useTransition } from "react";
import { Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/components/permissions-provider";
import type { TransportRequest } from "@/types/transport";
import { cancelTransportRequest, createTransportRequest } from "../actions";
import { Checklist, FollowUps, StatusBadge, fmt } from "./task-bits";

/** Employee view: request a ride and follow your requests. */
export function TransportBoard({ mine }: { mine: TransportRequest[] }) {
  const { can } = usePermissions();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [departAt, setDepartAt] = useState("");
  const [passengers, setPassengers] = useState("1");
  const [purpose, setPurpose] = useState("");

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

      {can("transportation", "create") && (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              createTransportRequest({
                pickup,
                dropoff,
                departAt,
                passengers: Number(passengers),
                purpose,
              }),
            () => {
              setPickup("");
              setDropoff("");
              setDepartAt("");
              setPassengers("1");
              setPurpose("");
            },
          );
        }}
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Pickup location" required className="rounded-md border bg-background px-3 py-2 text-sm" />
        <input value={dropoff} onChange={(e) => setDropoff(e.target.value)} placeholder="Drop-off location" required className="rounded-md border bg-background px-3 py-2 text-sm" />
        <input value={departAt} onChange={(e) => setDepartAt(e.target.value)} type="datetime-local" required className="rounded-md border bg-background px-3 py-2 text-sm" />
        <input value={passengers} onChange={(e) => setPassengers(e.target.value)} type="number" min={1} placeholder="Passengers" className="rounded-md border bg-background px-3 py-2 text-sm" />
        <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose (optional)" className="rounded-md border bg-background px-3 py-2 text-sm lg:col-span-1" />
        <Button type="submit" disabled={pending}>
          <Car className="h-4 w-4" /> Request
        </Button>
      </form>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My requests</h2>
        <div className="space-y-3">
          {mine.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={r.status} />
                <span className="font-medium">
                  {r.pickup} → {r.dropoff}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fmt(r.depart_at)} · {r.passengers} pax
                  {r.purpose ? ` · ${r.purpose}` : ""}
                </span>
                {(r.status === "pending" || r.status === "assigned") && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    className="ml-auto"
                    onClick={() => run(() => cancelTransportRequest(r.id))}
                  >
                    Cancel
                  </Button>
                )}
              </div>
              {(r.driver_name || r.vehicle_name) && (
                <p className="mt-1 text-sm">
                  <span className="text-muted-foreground">Driver:</span>{" "}
                  <span className="font-medium">{r.driver_name ?? "TBC"}</span>
                  {r.driver_phone ? ` · ${r.driver_phone}` : ""}
                  {r.vehicle_name ? ` · ${r.vehicle_name}` : ""}
                </p>
              )}
              <Checklist task={r} canTick={false} />
              <FollowUps task={r} canPost />
            </div>
          ))}
          {mine.length === 0 && (
            <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
              No requests yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
