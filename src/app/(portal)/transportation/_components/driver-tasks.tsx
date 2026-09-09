"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Navigation, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import { describeTripLog } from "@/lib/transport/trip-log";
import { TRANSPORT_OPEN_STATUSES, type Driver, type TransportRequest } from "@/types/transport";
import { completeTrip, markNoShow, setMyDuty, setTransportStatus, startTrip } from "../actions";
import { Checklist, FollowUps, PriorityBadge, StatusBadge, Stars, TypeBadge, fmt } from "./task-bits";

const field = "rounded-md border bg-background px-2 py-1.5 text-sm";

/**
 * The signed-in driver's live task list. A task moves Start trip →
 * Arrived at pickup → Complete (with the trip log: odometer, fuel) or
 * No-show; follow-ups on each. Recent closed trips underneath, with the
 * requester's rating when they left one.
 */
export function DriverTasks({ driver, tasks }: { driver: Driver; tasks: TransportRequest[] }) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [onDuty, setOnDuty] = useState(driver.on_duty);

  const open = tasks.filter((t) => t.status === "assigned" || t.status === "in_progress" || t.status === "arrived");
  const done = tasks.filter((t) => !(TRANSPORT_OPEN_STATUSES as string[]).includes(t.status));
  const openReveal = useProgressiveReveal(open.length);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Could not update task.");
    });
  }

  function toggleDuty() {
    setError(null);
    const next = !onDuty;
    setOnDuty(next);
    startTransition(async () => {
      const res = await setMyDuty(next);
      if (!res.ok) {
        setError(res.error ?? "Could not update duty status.");
        setOnDuty(!next);
      }
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
        <Button size="sm" variant={onDuty ? "outline" : "default"} disabled={pending} onClick={toggleDuty} className="ml-auto">
          <Power className={cn("h-4 w-4", onDuty ? "text-green-600" : "text-muted-foreground")} />
          {onDuty ? "On duty" : "Off duty"}
        </Button>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {open.length === 0 && <p className="text-sm text-muted-foreground">No open tasks. New assignments appear here live.</p>}

      <div className="grid gap-3 lg:grid-cols-2">
        {open.slice(0, openReveal.count).map((t) => (
          <TaskCard key={t.id} t={t} pending={pending} run={run} />
        ))}
      </div>
      <ShowMore
        ref={openReveal.sentinelRef}
        hasMore={openReveal.hasMore}
        remaining={openReveal.remaining}
        onClick={openReveal.showMore}
        label="Show more tasks"
      />

      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Recent closed ({done.length})</summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {done.slice(0, 10).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <StatusBadge status={t.status} />
                <span>
                  {fmt(t.depart_at)} · {t.pickup} → {t.dropoff}
                </span>
                {describeTripLog(t.log) && <span className="text-xs">· {describeTripLog(t.log)}</span>}
                {t.rating !== null && (
                  <span className="text-xs">
                    · <Stars rating={t.rating} />
                    {t.rating_comment ? ` "${t.rating_comment}"` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function TaskCard({
  t,
  pending,
  run,
}: {
  t: TransportRequest;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [odoStart, setOdoStart] = useState("");
  const [closing, setClosing] = useState(false);
  const [odoEnd, setOdoEnd] = useState("");
  const [litres, setLitres] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="rounded-lg border bg-card p-3">
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
        {t.log.odometer_start !== null ? ` · odometer ${t.log.odometer_start} at start` : ""}
      </p>
      {t.notes && <p className="mt-1 text-sm">{t.notes}</p>}

      {t.status === "assigned" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={odoStart}
            onChange={(e) => setOdoStart(e.target.value)}
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="Odometer (km, optional)"
            className={`${field} w-44`}
          />
          <Button size="sm" disabled={pending} onClick={() => run(() => startTrip(t.id, odoStart || null))}>
            Start trip
          </Button>
        </div>
      )}

      {(t.status === "in_progress" || t.status === "arrived") && !closing && (
        <div className="mt-2 flex flex-wrap gap-2">
          {t.status === "in_progress" && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setTransportStatus(t.id, "arrived"))}>
              Arrived at pickup
            </Button>
          )}
          <Button size="sm" disabled={pending} onClick={() => setClosing(true)}>
            Complete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const why = prompt("Passenger no-show — anything to note (how long you waited, who you called)?");
              if (why !== null) run(() => markNoShow(t.id, why));
            }}
          >
            No-show
          </Button>
        </div>
      )}

      {closing && (
        <form
          className="mt-2 space-y-2 rounded-md border bg-background/60 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() =>
              completeTrip(
                t.id,
                {
                  odometerStart: t.log.odometer_start ?? (odoStart || null),
                  odometerEnd: odoEnd || null,
                  fuelLitres: litres || null,
                  fuelCost: cost || null,
                },
                note,
              ),
            );
          }}
        >
          <p className="text-xs font-medium">Trip log (all optional)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {t.log.odometer_start === null && (
              <input value={odoStart} onChange={(e) => setOdoStart(e.target.value)} type="number" min={0} inputMode="numeric" placeholder="Odometer at start" className={field} />
            )}
            <input value={odoEnd} onChange={(e) => setOdoEnd(e.target.value)} type="number" min={0} inputMode="numeric" placeholder="Odometer at end" className={field} />
            <input value={litres} onChange={(e) => setLitres(e.target.value)} type="number" min={0} step="0.1" inputMode="decimal" placeholder="Fuel (litres)" className={field} />
            <input value={cost} onChange={(e) => setCost(e.target.value)} type="number" min={0} step="1" inputMode="decimal" placeholder="Fuel cost" className={field} />
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to note (optional)" className={`${field} w-full`} />
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={pending}>
              Complete trip
            </Button>
            <Button size="sm" type="button" variant="ghost" disabled={pending} onClick={() => setClosing(false)}>
              Back
            </Button>
          </div>
        </form>
      )}

      <Checklist task={t} canTick />
      <FollowUps task={t} canPost />
    </div>
  );
}
