"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStatusTransition } from "@/components/activity";
import { Car, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import { TRANSPORT_STATUS_LABEL, type TransportRequest, type TransportStatus } from "@/types/transport";
import { cancelTransportRequest } from "../actions";
import { Checklist, FollowUps, PriorityBadge, StatusBadge, TypeBadge, fmt } from "./task-bits";

type Filter = "open" | "all" | TransportStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "awaiting_approval", label: TRANSPORT_STATUS_LABEL.awaiting_approval },
  { key: "pending", label: TRANSPORT_STATUS_LABEL.pending },
  { key: "assigned", label: TRANSPORT_STATUS_LABEL.assigned },
  { key: "in_progress", label: TRANSPORT_STATUS_LABEL.in_progress },
  { key: "completed", label: TRANSPORT_STATUS_LABEL.completed },
  { key: "cancelled", label: TRANSPORT_STATUS_LABEL.cancelled },
  { key: "all", label: "All" },
];

const OPEN: TransportStatus[] = ["awaiting_approval", "pending", "assigned", "in_progress"];

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
}: {
  requests: TransportRequest[];
  scope: "all" | "mine";
  canCreate: boolean;
  canDispatch: boolean;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");

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
              <span className="font-medium">
                {r.pickup} → {r.dropoff}
              </span>
              <span className="text-xs text-muted-foreground">
                {fmt(r.depart_at)} · {r.passengers} pax
                {r.purpose ? ` · ${r.purpose}` : ""}
                {scope === "all" && r.requester_name ? ` · for ${r.requester_name}` : ""}
              </span>
              {(r.status === "awaiting_approval" || r.status === "pending" || r.status === "assigned") && (
                <Button size="sm" variant="outline" disabled={pending} className="ml-auto" onClick={() => cancel(r.id)}>
                  Cancel
                </Button>
              )}
            </div>
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
