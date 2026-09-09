"use client";

import { useMemo, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import Link from "next/link";
import { ClipboardList, Clock, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LazySelect } from "@/components/ui/lazy-select";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import { usePermissions } from "@/components/permissions-provider";
import { isLateStart, minutesLate } from "@/lib/transport/live";
import {
  PRIORITY_LABEL,
  TASK_TYPE_LABEL,
  TRANSPORT_OPEN_STATUSES,
  type Driver,
  type Place,
  type TransportPriority,
  type TransportRequest,
  type TransportTaskType,
  type Vehicle,
} from "@/types/transport";
import { assignTransport, createTransportTask, markNoShow, setTransportStatus } from "../actions";
import { Checklist, FollowUps, PriorityBadge, StatusBadge, TypeBadge, fmt } from "./task-bits";
import { TransportAnalytics } from "./transport-analytics";
import { PLACES_LIST_ID, PlacesDatalist } from "./places-datalist";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

type Runner = (
  fn: () => Promise<{ ok: boolean; error?: string; warning?: string }>,
  onOk?: () => void,
) => void;

export function DispatchBoard({
  all,
  drivers,
  vehicles,
  places,
  lateMinutes,
}: {
  all: TransportRequest[];
  drivers: Driver[];
  vehicles: Vehicle[];
  places: Place[];
  /** Past departure by this much with nobody on the way, a task is flagged late. */
  lateMinutes: number;
}) {
  const { can } = usePermissions();
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run: Runner = (fn, onOk) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else {
        if (res.warning) setNotice(res.warning);
        onOk?.();
      }
    });
  };

  const active = all.filter((r) => (TRANSPORT_OPEN_STATUSES as string[]).includes(r.status));
  const closed = all.filter((r) => !(TRANSPORT_OPEN_STATUSES as string[]).includes(r.status));
  const nowIso = new Date().toISOString();
  const lateCount = active.filter((r) => isLateStart(r, nowIso, lateMinutes)).length;
  const stat = (s: string) => all.filter((r) => r.status === s).length;
  const unassigned = active.filter((r) => !r.driver_id).length;

  // Surface on-duty (available) drivers first in every assign dropdown.
  const sortedDrivers = useMemo(
    () =>
      [...drivers].sort(
        (a, b) => Number(b.on_duty) - Number(a.on_duty) || a.full_name.localeCompare(b.full_name),
      ),
    [drivers],
  );

  const activeReveal = useProgressiveReveal(active.length);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Dispatch board</h2>
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          {lateCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 font-medium text-destructive">
              <Clock className="h-3 w-3" /> {lateCount} not started
            </span>
          )}
          {unassigned > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-800">
              <TriangleAlert className="h-3 w-3" /> {unassigned} unassigned
            </span>
          )}
          {(["pending", "assigned", "in_progress", "arrived"] as const).map((s) => (
            <span key={s} className="rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground">
              {stat(s)} {s.replace("_", " ")}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}
      {notice && (
        <p className="rounded-md bg-amber-100 px-4 py-2 text-sm text-amber-800">
          ⚠ Assigned, but heads-up: {notice}
        </p>
      )}

      <TransportAnalytics all={all} drivers={drivers} />

      {can("transportation", "manage") && (
        <NewTaskForm drivers={sortedDrivers} vehicles={vehicles} places={places} pending={pending} run={run} />
      )}

      <div className="space-y-3">
        {active.slice(0, activeReveal.count).map((r) => (
          <TaskRow key={r.id} r={r} drivers={sortedDrivers} vehicles={vehicles} pending={pending} run={run} late={isLateStart(r, nowIso, lateMinutes) ? minutesLate(r.depart_at, nowIso) : null} />
        ))}
        {active.length === 0 && (
          <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
            No active tasks.
          </p>
        )}
      </div>
      <ShowMore
        ref={activeReveal.sentinelRef}
        hasMore={activeReveal.hasMore}
        remaining={activeReveal.remaining}
        onClick={activeReveal.showMore}
        label="Show more tasks"
      />

      {closed.length > 0 && (
        <details className="rounded-lg border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Completed / cancelled ({closed.length})
          </summary>
          <div className="mt-2 space-y-2">
            {closed.slice(0, 20).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <StatusBadge status={r.status} />
                <span>
                  {r.pickup} → {r.dropoff}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fmt(r.depart_at)} · {r.driver_name ?? "no driver"}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="text-xs text-muted-foreground">
        Vehicles and drivers are managed on the{" "}
        <Link href="/transportation?view=fleet" className="font-medium underline">
          Vehicles &amp; drivers
        </Link>{" "}
        view; the{" "}
        <Link href="/transportation?view=planner" className="font-medium underline">
          Day planner
        </Link>{" "}
        shows the same tasks on a clock.
      </p>
    </section>
  );
}

function TaskRow({
  r,
  drivers,
  vehicles,
  pending,
  run,
  late,
}: {
  r: TransportRequest;
  drivers: Driver[];
  vehicles: Vehicle[];
  pending: boolean;
  run: Runner;
  /** Minutes past departure with nobody on the way, when the task is flagged late. */
  late: number | null;
}) {
  const busy = r.status === "in_progress" || r.status === "arrived";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={r.status} />
        <TypeBadge type={r.task_type} />
        <PriorityBadge priority={r.priority} />
        {!r.driver_id && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            Unassigned
          </span>
        )}
        {late !== null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive" title="Past departure and nobody on the way">
            <Clock className="h-3 w-3" /> Not started · {late} min late
          </span>
        )}
        <span className="font-medium">
          {r.pickup} → {r.dropoff}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{fmt(r.depart_at)}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {r.requester_name ? `Requested by ${r.requester_name} · ` : "Dispatcher task · "}
        {r.passengers} pax
        {r.purpose ? ` · ${r.purpose}` : ""}
        {r.driver_phone ? ` · driver ${r.driver_phone}` : ""}
      </p>
      {r.notes && <p className="mt-1 text-sm">{r.notes}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <LazySelect
          value={r.driver_id ?? null}
          options={drivers}
          getOptionValue={(d) => d.id}
          getOptionLabel={(d) => `${d.full_name}${d.on_duty ? "" : " (off duty)"}`}
          placeholder={r.driver_id ? "Driver…" : "Assign driver…"}
          disabled={pending || busy}
          className={`rounded-md border px-1.5 py-1 text-xs ${
            r.driver_id ? "bg-background" : "border-amber-400 bg-amber-50 font-medium text-amber-900"
          }`}
          onChange={(v) => run(() => assignTransport(r.id, v, r.vehicle_id))}
        />
        <LazySelect
          value={r.vehicle_id ?? null}
          options={vehicles}
          getOptionValue={(v) => v.id}
          getOptionLabel={(v) => v.name}
          placeholder="Vehicle…"
          disabled={pending || busy}
          className="rounded-md border bg-background px-1.5 py-1 text-xs"
          onChange={(v) => run(() => assignTransport(r.id, r.driver_id, v))}
        />
        <div className="ml-auto flex gap-1">
          {r.status === "assigned" && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setTransportStatus(r.id, "in_progress"))}>
              Start
            </Button>
          )}
          {r.status === "in_progress" && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setTransportStatus(r.id, "arrived"))}>
              Arrived
            </Button>
          )}
          {busy && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setTransportStatus(r.id, "completed"))}>
              Complete
            </Button>
          )}
          {busy && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                const why = prompt("Passenger no-show — anything to note?");
                if (why !== null) run(() => markNoShow(r.id, why));
              }}
            >
              No-show
            </Button>
          )}
          {(r.status === "pending" || r.status === "assigned") && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setTransportStatus(r.id, "cancelled"))}>
              Cancel
            </Button>
          )}
        </div>
      </div>
      <Checklist task={r} canTick canAdd />
      <FollowUps task={r} canPost />
    </div>
  );
}

function NewTaskForm({
  drivers,
  vehicles,
  places,
  pending,
  run,
}: {
  drivers: Driver[];
  vehicles: Vehicle[];
  places: Place[];
  pending: boolean;
  run: Runner;
}) {
  const [taskType, setTaskType] = useState<TransportTaskType>("passenger");
  const [priority, setPriority] = useState<TransportPriority>("normal");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [departAt, setDepartAt] = useState("");
  const [passengers, setPassengers] = useState("1");
  const [notes, setNotes] = useState("");
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium">New task (assign directly)</summary>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              createTransportTask({
                taskType,
                priority,
                pickup,
                dropoff,
                departAt,
                passengers: Number(passengers),
                notes,
                driverId: driverId || undefined,
                vehicleId: vehicleId || undefined,
              }),
            () => {
              setPickup("");
              setDropoff("");
              setDepartAt("");
              setPassengers("1");
              setNotes("");
              setDriverId("");
              setVehicleId("");
            },
          );
        }}
      >
        <select value={taskType} onChange={(e) => setTaskType(e.target.value as TransportTaskType)} className={field}>
          {(Object.keys(TASK_TYPE_LABEL) as TransportTaskType[]).map((t) => (
            <option key={t} value={t}>
              {TASK_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value as TransportPriority)} className={field}>
          {(Object.keys(PRIORITY_LABEL) as TransportPriority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]} priority
            </option>
          ))}
        </select>
        <input value={departAt} onChange={(e) => setDepartAt(e.target.value)} type="datetime-local" required className={field} />
        <PlacesDatalist places={places} />
        <input value={pickup} onChange={(e) => setPickup(e.target.value)} list={PLACES_LIST_ID} autoComplete="off" placeholder="Pickup" required className={field} />
        <input value={dropoff} onChange={(e) => setDropoff(e.target.value)} list={PLACES_LIST_ID} autoComplete="off" placeholder="Drop-off" required className={field} />
        <input value={passengers} onChange={(e) => setPassengers(e.target.value)} type="number" min={1} placeholder="Passengers" className={field} />
        <LazySelect
          value={driverId || null}
          options={drivers}
          getOptionValue={(d) => d.id}
          getOptionLabel={(d) => `${d.full_name}${d.on_duty ? "" : " (off duty)"}`}
          placeholder="Driver (assign later)"
          className={field}
          onChange={(v) => setDriverId(v ?? "")}
        />
        <LazySelect
          value={vehicleId || null}
          options={vehicles}
          getOptionValue={(v) => v.id}
          getOptionLabel={(v) => v.name}
          placeholder="Vehicle…"
          className={field}
          onChange={(v) => setVehicleId(v ?? "")}
        />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instructions for the driver" className={field} />
        <Button type="submit" disabled={pending}>
          Create task
        </Button>
      </form>
    </details>
  );
}
