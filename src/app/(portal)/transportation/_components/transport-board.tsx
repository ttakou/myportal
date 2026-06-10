"use client";

import { useState, useTransition } from "react";
import { Car } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  TRANSPORT_STATUS_LABEL,
  type Driver,
  type TransportRequest,
  type TransportStatus,
  type Vehicle,
} from "@/types/transport";
import {
  assignTransport,
  cancelTransportRequest,
  createTransportRequest,
  setTransportStatus,
} from "../actions";

const STATUS_STYLE: Record<TransportStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  assigned: "bg-accent text-accent-foreground",
  in_progress: "bg-primary/10 text-primary",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-destructive/10 text-destructive line-through",
};

function StatusBadge({ status }: { status: TransportStatus }) {
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLE[status])}>
      {TRANSPORT_STATUS_LABEL[status]}
    </span>
  );
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TransportBoard({
  mine,
  all,
  drivers,
  vehicles,
  isAdmin,
}: {
  mine: TransportRequest[];
  all: TransportRequest[];
  drivers: Driver[];
  vehicles: Vehicle[];
  isAdmin: boolean;
}) {
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

      <RequestTable
        title="My requests"
        rows={mine}
        showRequester={false}
        pending={pending}
        renderActions={(r) =>
          r.status === "pending" || r.status === "assigned" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => cancelTransportRequest(r.id))}>
              Cancel
            </Button>
          ) : null
        }
      />

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Dispatch · all requests</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Requester / Route</th>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Assign</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {all.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.requester_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.pickup} → {r.dropoff} · {r.passengers} pax
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmt(r.depart_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <select
                          value={r.driver_id ?? ""}
                          disabled={pending || r.status === "cancelled"}
                          onChange={(e) => run(() => assignTransport(r.id, e.target.value || null, r.vehicle_id))}
                          className="rounded-md border bg-background px-1.5 py-1 text-xs"
                        >
                          <option value="">Driver…</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>{d.full_name}</option>
                          ))}
                        </select>
                        <select
                          value={r.vehicle_id ?? ""}
                          disabled={pending || r.status === "cancelled"}
                          onChange={(e) => run(() => assignTransport(r.id, r.driver_id, e.target.value || null))}
                          className="rounded-md border bg-background px-1.5 py-1 text-xs"
                        >
                          <option value="">Vehicle…</option>
                          {vehicles.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.status} />
                        {r.status === "assigned" && (
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setTransportStatus(r.id, "in_progress"))}>Start</Button>
                        )}
                        {r.status === "in_progress" && (
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setTransportStatus(r.id, "completed"))}>Complete</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {all.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No requests.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function RequestTable({
  title,
  rows,
  pending,
  renderActions,
}: {
  title: string;
  rows: TransportRequest[];
  showRequester: boolean;
  pending: boolean;
  renderActions: (r: TransportRequest) => React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Route</th>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Driver / Vehicle</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.pickup} → {r.dropoff}</div>
                  <div className="text-xs text-muted-foreground">{r.passengers} pax{r.purpose ? ` · ${r.purpose}` : ""}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{fmt(r.depart_at)}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.driver_name || r.vehicle_name
                    ? [r.driver_name, r.vehicle_name].filter(Boolean).join(" · ")
                    : "—"}
                </td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3 text-right">{renderActions(r)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No requests yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
