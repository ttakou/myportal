"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStatusTransition } from "@/components/activity";
import { Car, Pencil, Truck, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import { isoToLocalInput } from "@/lib/transport/day-plan";
import { describeTripLog } from "@/lib/transport/trip-log";
import { TRANSPORT_OPEN_STATUSES, TRANSPORT_STATUS_LABEL, type Place, type TransportRequest, type TransportStatus } from "@/types/transport";
import { cancelTransportRequest, rateTrip, updateTransportRequest } from "../actions";
import { PLACES_LIST_ID, PlacesDatalist } from "./places-datalist";
import { Checklist, FollowUps, PriorityBadge, StatusBadge, Stars, TypeBadge, fmt } from "./task-bits";

const field = "rounded-md border bg-background px-2 py-1.5 text-sm";

type Filter = "open" | "all" | TransportStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "awaiting_approval", label: TRANSPORT_STATUS_LABEL.awaiting_approval },
  { key: "pending", label: TRANSPORT_STATUS_LABEL.pending },
  { key: "assigned", label: TRANSPORT_STATUS_LABEL.assigned },
  { key: "in_progress", label: TRANSPORT_STATUS_LABEL.in_progress },
  { key: "arrived", label: TRANSPORT_STATUS_LABEL.arrived },
  { key: "completed", label: TRANSPORT_STATUS_LABEL.completed },
  { key: "no_show", label: TRANSPORT_STATUS_LABEL.no_show },
  { key: "cancelled", label: TRANSPORT_STATUS_LABEL.cancelled },
  { key: "all", label: "All" },
];

const OPEN: TransportStatus[] = TRANSPORT_OPEN_STATUSES;

/**
 * Every transportation request: all of them for an admin, your own for
 * everybody else. Open ones first, a status filter, and the follow-up
 * thread on each. A requester can cancel their own until a driver starts.
 */
export function RequestsList({
  requests,
  scope,
  canCreate,
  canDispatch,
  places,
}: {
  requests: TransportRequest[];
  scope: "all" | "mine";
  canCreate: boolean;
  canDispatch: boolean;
  places: Place[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [editing, setEditing] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  const shown = useMemo(() => {
    const list = filter === "all" ? requests : filter === "open" ? requests.filter((r) => OPEN.includes(r.status)) : requests.filter((r) => r.status === filter);
    // Open requests soonest first; the rest most recent first.
    return [...list].sort((a, b) => {
      const ao = OPEN.includes(a.status);
      const bo = OPEN.includes(b.status);
      if (ao !== bo) return ao ? -1 : 1;
      return ao ? a.depart_at.localeCompare(b.depart_at) : b.depart_at.localeCompare(a.depart_at);
    });
  }, [requests, filter]);
  const reveal = useProgressiveReveal(shown.length);

  // Outbound id → its return leg, for the "return booked" line.
  const returnOf = useMemo(() => {
    const m = new Map<string, TransportRequest>();
    for (const r of requests) if (r.return_of) m.set(r.return_of, r);
    return m;
  }, [requests]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, all: requests.length };
    for (const r of requests) {
      c[r.status] = (c[r.status] ?? 0) + 1;
      if (OPEN.includes(r.status)) c.open += 1;
    }
    return c;
  }, [requests]);

  function cancel(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await cancelTransportRequest(id);
      if (!res.ok) setError(res.error ?? "Could not cancel.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold">{scope === "all" ? "Transportation requests" : "My transportation requests"}</h2>
          <p className="text-sm text-muted-foreground">
            {scope === "all"
              ? "Every request in the organisation. Assign drivers and vehicles on the dispatch board."
              : "The rides you asked for, and who is driving them."}
          </p>
        </div>
        <span className="ml-auto flex gap-2">
          {canDispatch && (
            <Link href="/transportation?view=dispatch" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
              <Truck className="h-4 w-4" /> Dispatch board
            </Link>
          )}
          {canCreate && (
            <Link href="/transportation?view=new" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Car className="h-4 w-4" /> Request a transportation
            </Link>
          )}
        </span>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <PlacesDatalist places={places} />

      <nav className="flex flex-wrap gap-1" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              filter === f.key ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent",
            )}
          >
            {f.label} <span className="tabular-nums opacity-70">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </nav>

      <div className="space-y-3">
        {shown.slice(0, reveal.count).map((r) => (
          <div key={r.id} className="rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={r.status} />
              <TypeBadge type={r.task_type} />
              {r.priority !== "normal" && <PriorityBadge priority={r.priority} />}
              {r.return_of && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                  <Undo2 className="h-3 w-3" /> Return leg
                </span>
              )}
              <span className="font-medium">
                {r.pickup} → {r.dropoff}
              </span>
              <span className="text-xs text-muted-foreground">
                {fmt(r.depart_at)} · {r.passengers} pax
                {r.purpose ? ` · ${r.purpose}` : ""}
                {scope === "all" && r.requester_name ? ` · for ${r.requester_name}` : ""}
              </span>
              <span className="ml-auto flex gap-1.5">
                {(r.status === "awaiting_approval" || r.status === "pending") && (
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(editing === r.id ? null : r.id)}>
                    <Pencil className="h-3.5 w-3.5" /> {editing === r.id ? "Close" : "Edit"}
                  </Button>
                )}
                {(r.status === "awaiting_approval" || r.status === "pending" || r.status === "assigned") && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => cancel(r.id)}>
                    Cancel
                  </Button>
                )}
              </span>
            </div>
            {editing === r.id && <EditRequest r={r} pending={pending} run={run} onDone={() => setEditing(null)} />}
            {returnOf.get(r.id) && (
              <p className="mt-1 text-xs text-muted-foreground">
                Return booked: {returnOf.get(r.id)!.pickup} → {returnOf.get(r.id)!.dropoff} · {fmt(returnOf.get(r.id)!.depart_at)}
              </p>
            )}
            {(r.driver_name || r.vehicle_name) ? (
              <p className="mt-1 text-sm">
                <span className="text-muted-foreground">Driver:</span>{" "}
                <span className="font-medium">{r.driver_name ?? "TBC"}</span>
                {r.driver_phone ? ` · ${r.driver_phone}` : ""}
                {r.vehicle_name ? ` · ${r.vehicle_name}` : ""}
              </p>
            ) : (
              OPEN.includes(r.status) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.status === "awaiting_approval" ? "Waiting for your line manager's approval." : "No driver assigned yet."}
                </p>
              )
            )}
            {describeTripLog(r.log) && r.status === "completed" && (
              <p className="mt-1 text-xs text-muted-foreground">Trip log: {describeTripLog(r.log)}</p>
            )}
            {r.status === "completed" && scope === "mine" && (
              <Rate r={r} pending={pending} run={run} />
            )}
            {r.status === "completed" && scope === "all" && r.rating !== null && (
              <p className="mt-1 text-xs text-muted-foreground">
                Rated <Stars rating={r.rating} />
                {r.rating_comment ? ` "${r.rating_comment}"` : ""}
              </p>
            )}
            <Checklist task={r} canTick={false} />
            <FollowUps task={r} canPost />
          </div>
        ))}
        {shown.length === 0 && (
          <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
            {filter === "open" ? "No open requests." : "Nothing here."}
          </p>
        )}
      </div>
      <ShowMore ref={reveal.sentinelRef} hasMore={reveal.hasMore} remaining={reveal.remaining} onClick={reveal.showMore} label="Show more requests" />
    </div>
  );
}

type Runner = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;

/** Change a request nobody has picked up yet: where, when, how many. */
function EditRequest({ r, pending, run, onDone }: { r: TransportRequest; pending: boolean; run: Runner; onDone: () => void }) {
  const [pickup, setPickup] = useState(r.pickup);
  const [dropoff, setDropoff] = useState(r.dropoff);
  const [departAt, setDepartAt] = useState(isoToLocalInput(r.depart_at));
  const [passengers, setPassengers] = useState(String(r.passengers));
  const [purpose, setPurpose] = useState(r.purpose ?? "");
  return (
    <form
      className="mt-2 grid gap-2 rounded-md border bg-background/60 p-2 sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateTransportRequest(r.id, { pickup, dropoff, departAt, passengers: Number(passengers), purpose }), onDone);
      }}
    >
      <input value={pickup} onChange={(e) => setPickup(e.target.value)} list={PLACES_LIST_ID} autoComplete="off" placeholder="Pickup" required className={field} />
      <input value={dropoff} onChange={(e) => setDropoff(e.target.value)} list={PLACES_LIST_ID} autoComplete="off" placeholder="Drop-off" required className={field} />
      <input value={departAt} onChange={(e) => setDepartAt(e.target.value)} type="datetime-local" required className={field} title="On the office clock (Douala)" />
      <input value={passengers} onChange={(e) => setPassengers(e.target.value)} type="number" min={1} className={field} />
      <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose" className={field} />
      <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
        <Button size="sm" type="submit" disabled={pending}>
          Save changes
        </Button>
        <span className="self-center text-xs text-muted-foreground">Times are on the office clock, wherever you are.</span>
      </div>
    </form>
  );
}

/** The requester's word after the ride: one to five stars, a comment if they like. */
function Rate({ r, pending, run }: { r: TransportRequest; pending: boolean; run: Runner }) {
  const [hover, setHover] = useState<number | null>(null);
  const [comment, setComment] = useState(r.rating_comment ?? "");
  const [picked, setPicked] = useState<number | null>(r.rating);
  if (r.rating !== null && picked === r.rating && !hover) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        You rated this ride <Stars rating={r.rating} />
        {r.rating_comment ? ` "${r.rating_comment}"` : ""}{" "}
        <button type="button" className="underline" onClick={() => setPicked(null)}>
          change
        </button>
      </p>
    );
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">How was the ride?</span>
      <span className="inline-flex text-lg leading-none" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={pending}
            onMouseEnter={() => setHover(n)}
            onClick={() => setPicked(n)}
            className={cn("px-0.5 text-amber-500", (hover ?? picked ?? 0) >= n ? "" : "opacity-25")}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
          >
            ★
          </button>
        ))}
      </span>
      {picked !== null && (
        <>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="A word about the driver (optional)" className={`${field} w-64`} />
          <Button size="sm" disabled={pending} onClick={() => run(() => rateTrip(r.id, picked, comment))}>
            Send
          </Button>
        </>
      )}
    </div>
  );
}
