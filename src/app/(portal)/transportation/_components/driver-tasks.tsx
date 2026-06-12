"use client";

import { useState, useTransition } from "react";
import { Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Driver, TransportRequest } from "@/types/transport";
import { setTransportStatus } from "../actions";
import { FollowUps, PriorityBadge, StatusBadge, TypeBadge, fmt } from "./task-bits";

/** The signed-in driver's live task list: start, complete, follow up. */
export function DriverTasks({ driver, tasks }: { driver: Driver; tasks: TransportRequest[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const open = tasks.filter((t) => t.status === "assigned" || t.status === "in_progress");
  const done = tasks.filter((t) => t.status === "completed" || t.status === "cancelled");

  function advance(id: string, status: "in_progress" | "completed") {
    setError(null);
    startTransition(async () => {
      const res = await setTransportStatus(id, status);
      if (!res.ok) setError(res.error ?? "Could not update task.");
    });
  }

  return (
    <section className="space-y-3 rounded-lg border bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <Navigation className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">My driving tasks</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {driver.full_name} · {open.length} open
        </span>
      </div>
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {open.length === 0 && (
        <p className="text-sm text-muted-foreground">No open tasks. New assignments appear here live.</p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {open.map((t) => (
          <div key={t.id} className="rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={t.status} />
              <TypeBadge type={t.task_type} />
              <PriorityBadge priority={t.priority} />
              <span className="ml-auto text-xs text-muted-foreground">{fmt(t.depart_at)}</span>
            </div>
            <p className="mt-2 font-medium">
              {t.pickup} → {t.dropoff}
            </p>
            <p className="text-xs text-muted-foreground">
              {t.passengers} pax
              {t.requester_name ? ` · for ${t.requester_name}` : ""}
              {t.vehicle_name ? ` · ${t.vehicle_name}` : ""}
            </p>
            {t.notes && <p className="mt-1 text-sm">{t.notes}</p>}
            <div className="mt-2 flex gap-2">
              {t.status === "assigned" && (
                <Button size="sm" disabled={pending} onClick={() => advance(t.id, "in_progress")}>
                  Start trip
                </Button>
              )}
              {t.status === "in_progress" && (
                <Button size="sm" disabled={pending} onClick={() => advance(t.id, "completed")}>
                  Complete
                </Button>
              )}
            </div>
            <FollowUps task={t} canPost />
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            Recent completed ({done.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {done.slice(0, 10).map((t) => (
              <li key={t.id}>
                {fmt(t.depart_at)} · {t.pickup} → {t.dropoff}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
