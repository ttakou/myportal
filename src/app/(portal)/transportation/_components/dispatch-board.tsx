"use client";

import { useMemo, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { ClipboardList, TriangleAlert, Truck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LazySelect } from "@/components/ui/lazy-select";
import { usePermissions } from "@/components/permissions-provider";
import {
  PRIORITY_LABEL,
  TASK_TYPE_LABEL,
  VEHICLE_STATUS_LABEL,
  type Driver,
  type TransportPriority,
  type TransportRequest,
  type TransportTaskType,
  type Vehicle,
  type VehicleStatus,
} from "@/types/transport";
import {
  addDriver,
  addVehicle,
  assignTransport,
  createTransportTask,
  linkDriverProfile,
  setTransportStatus,
  setVehicleStatus,
} from "../actions";
import { Checklist, FollowUps, PriorityBadge, StatusBadge, TypeBadge, fmt } from "./task-bits";
import { TransportAnalytics } from "./transport-analytics";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

type Runner = (
  fn: () => Promise<{ ok: boolean; error?: string; warning?: string }>,
  onOk?: () => void,
) => void;

export function DispatchBoard({
  all,
  drivers,
  vehicles,
  allVehicles,
  profiles,
}: {
  all: TransportRequest[];
  drivers: Driver[];
  vehicles: Vehicle[];
  allVehicles: Vehicle[];
  profiles: { id: string; full_name: string }[];
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

  const active = all.filter((r) => !["completed", "cancelled"].includes(r.status));
  const closed = all.filter((r) => ["completed", "cancelled"].includes(r.status));
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

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Dispatch board</h2>
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          {unassigned > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-800">
              <TriangleAlert className="h-3 w-3" /> {unassigned} unassigned
            </span>
          )}
          {(["pending", "assigned", "in_progress"] as const).map((s) => (
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
        <NewTaskForm drivers={sortedDrivers} vehicles={vehicles} pending={pending} run={run} />
      )}

      <div className="space-y-3">
        {active.map((r) => (
          <TaskRow key={r.id} r={r} drivers={sortedDrivers} vehicles={vehicles} pending={pending} run={run} />
        ))}
        {active.length === 0 && (
          <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
            No active tasks.
          </p>
        )}
      </div>

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

      {can("transportation", "manage") && (
        <DriversPanel drivers={drivers} profiles={profiles} pending={pending} run={run} />
      )}
      {can("transportation", "manage") && (
        <VehiclesPanel vehicles={allVehicles} pending={pending} run={run} />
      )}
    </section>
  );
}

function VehiclesPanel({
  vehicles,
  pending,
  run,
}: {
  vehicles: Vehicle[];
  pending: boolean;
  run: Runner;
}) {
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [capacity, setCapacity] = useState("4");

  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium">
        <span className="inline-flex items-center gap-1">
          <Truck className="h-4 w-4" /> Vehicles ({vehicles.length})
        </span>
      </summary>

      <div className="mt-2 space-y-2">
        {vehicles.map((v) => (
          <div key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{v.name}</span>
            {v.plate && <span className="text-xs text-muted-foreground">{v.plate}</span>}
            <span className="text-xs text-muted-foreground">· {v.capacity} seats</span>
            <select
              value={v.status}
              disabled={pending}
              onChange={(e) => run(() => setVehicleStatus(v.id, e.target.value as VehicleStatus))}
              className="ml-auto rounded-md border bg-background px-1.5 py-1 text-xs"
            >
              {(Object.keys(VEHICLE_STATUS_LABEL) as VehicleStatus[]).map((s) => (
                <option key={s} value={s}>
                  {VEHICLE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        ))}
        {vehicles.length === 0 && (
          <p className="text-xs text-muted-foreground">No vehicles yet.</p>
        )}
      </div>

      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => addVehicle({ name, plate, capacity: Number(capacity) }),
            () => {
              setName("");
              setPlate("");
              setCapacity("4");
            },
          );
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New vehicle (e.g. Toyota Hiace)" required className={field} />
        <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Plate" className={field} />
        <input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" min={1} placeholder="Seats" className={`${field} w-24`} />
        <Button type="submit" variant="outline" disabled={pending}>
          Add vehicle
        </Button>
      </form>
    </details>
  );
}

function TaskRow({
  r,
  drivers,
  vehicles,
  pending,
  run,
}: {
  r: TransportRequest;
  drivers: Driver[];
  vehicles: Vehicle[];
  pending: boolean;
  run: Runner;
}) {
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
          disabled={pending || r.status === "in_progress"}
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
          disabled={pending || r.status === "in_progress"}
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
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setTransportStatus(r.id, "completed"))}>
              Complete
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
  pending,
  run,
}: {
  drivers: Driver[];
  vehicles: Vehicle[];
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
        <input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Pickup" required className={field} />
        <input value={dropoff} onChange={(e) => setDropoff(e.target.value)} placeholder="Drop-off" required className={field} />
        <input value={passengers} onChange={(e) => setPassengers(e.target.value)} type="number" min={1} placeholder="Passengers" className={field} />
        <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={field}>
          <option value="">Driver (assign later)</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}{d.on_duty ? "" : " (off duty)"}
            </option>
          ))}
        </select>
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={field}>
          <option value="">Vehicle…</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instructions for the driver" className={field} />
        <Button type="submit" disabled={pending}>
          Create task
        </Button>
      </form>
    </details>
  );
}

function DriversPanel({
  drivers,
  profiles,
  pending,
  run,
}: {
  drivers: Driver[];
  profiles: { id: string; full_name: string }[];
  pending: boolean;
  run: Runner;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileId, setProfileId] = useState("");

  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium">
        <span className="inline-flex items-center gap-1">
          <UserPlus className="h-4 w-4" /> Drivers ({drivers.length})
        </span>
      </summary>

      <p className="mt-2 text-xs text-muted-foreground">
        Link a driver to a portal account so they can see and update their own tasks live.
      </p>

      <div className="mt-2 space-y-2">
        {drivers.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{d.full_name}</span>
            {d.phone && <span className="text-xs text-muted-foreground">{d.phone}</span>}
            <LazySelect
              value={d.profile_id ?? null}
              options={profiles}
              getOptionValue={(p) => p.id}
              getOptionLabel={(p) => p.full_name ?? ""}
              placeholder="No portal account"
              disabled={pending}
              className="ml-auto rounded-md border bg-background px-1.5 py-1 text-xs"
              onChange={(v) => run(() => linkDriverProfile(d.id, v))}
            />
          </div>
        ))}
      </div>

      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => addDriver({ fullName: name, phone, profileId: profileId || undefined }),
            () => {
              setName("");
              setPhone("");
              setProfileId("");
            },
          );
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New driver name" required className={field} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={field} />
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={field}>
          <option value="">Portal account (optional)</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" disabled={pending}>
          Add driver
        </Button>
      </form>
    </details>
  );
}
