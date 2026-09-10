"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Repeat, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LazySelect } from "@/components/ui/lazy-select";
import { DAY_LABELS, describeDays, shuttlesDue } from "@/lib/transport/shuttles";
import { localTime } from "@/lib/transport/day-plan";
import { TASK_TYPE_LABEL, type Driver, type Place, type Shuttle, type TransportTaskType, type Vehicle } from "@/types/transport";
import { createShuttle, deleteShuttle, runShuttlesNow, updateShuttle } from "../actions";
import { PLACES_LIST_ID, PlacesDatalist } from "./places-datalist";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

/**
 * Runs that repeat. Each one names a route, a local departure time and the
 * days it runs; the nightly job (02:30 UTC) turns the day's shuttles into
 * tasks, assigned when a driver is named. "Create today's runs" does the
 * same on demand after a change.
 */
export function ShuttlesPanel({
  shuttles,
  drivers,
  vehicles,
  places,
}: {
  shuttles: Shuttle[];
  drivers: Driver[];
  vehicles: Vehicle[];
  places: Place[];
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const due = shuttlesDue(shuttles, today);

  function run(fn: () => Promise<{ ok: boolean; error?: string; created?: number }>, onOk?: (r: { created?: number }) => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.(res);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Repeat className="h-5 w-5 text-primary" /> Shuttle schedules
          </h2>
          <p className="text-sm text-muted-foreground">
            Regular runs the desk should not have to type every morning. The job creates each day&apos;s
            tasks at 03:30 local time; {due.length} run{due.length === 1 ? "" : "s"} today. Seats is how many people
            can book a place on a run under Book a shuttle seat.
          </p>
        </div>
        <Button
          variant="outline"
          className="ml-auto"
          disabled={pending || due.length === 0}
          onClick={() => run(() => runShuttlesNow(today), (r) => setNotice(`${r.created ?? 0} task(s) created for today.`))}
        >
          <Play className="h-4 w-4" /> Create today&apos;s runs now
        </Button>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      {notice && <p className="rounded-md bg-green-50 px-4 py-2 text-sm text-green-800">{notice}</p>}

      <div className="space-y-2">
        {shuttles.map((s) => (
          <div key={s.id} className={cn("rounded-lg border bg-card p-3", !s.is_active && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-xs">{s.depart_time}</span>
              <span className="font-medium">{s.name}</span>
              <span>
                {s.pickup} → {s.dropoff}
              </span>
              <span className="text-xs text-muted-foreground">
                {describeDays(s.days_of_week)} · {s.passengers} seats · {TASK_TYPE_LABEL[s.task_type]}
              </span>
              <span className="ml-auto flex items-center gap-2">
                <LazySelect
                  value={s.driver_id}
                  options={drivers}
                  getOptionValue={(d) => d.id}
                  getOptionLabel={(d) => d.full_name}
                  placeholder="Driver (assign daily)"
                  disabled={pending}
                  className="rounded-md border bg-background px-1.5 py-1 text-xs"
                  onChange={(v) => run(() => updateShuttle(s.id, { driverId: v }))}
                />
                <LazySelect
                  value={s.vehicle_id}
                  options={vehicles}
                  getOptionValue={(v) => v.id}
                  getOptionLabel={(v) => v.name}
                  placeholder="Vehicle…"
                  disabled={pending}
                  className="rounded-md border bg-background px-1.5 py-1 text-xs"
                  onChange={(v) => run(() => updateShuttle(s.id, { vehicleId: v }))}
                />
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => updateShuttle(s.id, { isActive: !s.is_active }))}>
                  {s.is_active ? "Pause" : "Resume"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Delete the shuttle "${s.name}"? Tasks already created stay.`)) run(() => deleteShuttle(s.id));
                  }}
                >
                  Delete
                </Button>
              </span>
            </div>
          </div>
        ))}
        {shuttles.length === 0 && (
          <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">No shuttles yet. Add the first one below.</p>
        )}
      </div>

      <NewShuttleForm drivers={drivers} vehicles={vehicles} places={places} pending={pending} run={run} />

      {due.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Today: {due.map((d) => `${localTime(d.departAt)} ${d.shuttle.name}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

function NewShuttleForm({
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
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const [name, setName] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [time, setTime] = useState("06:30");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [passengers, setPassengers] = useState("8");
  const [taskType, setTaskType] = useState<TransportTaskType>("passenger");
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  const toggle = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  return (
    <form
      className="space-y-3 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            createShuttle({
              name,
              pickup,
              dropoff,
              departTime: time,
              daysOfWeek: days,
              passengers: Number(passengers),
              taskType,
              driverId: driverId || null,
              vehicleId: vehicleId || null,
            }),
          () => {
            setName("");
            setPickup("");
            setDropoff("");
          },
        );
      }}
    >
      <h3 className="text-sm font-semibold">New shuttle</h3>
      <PlacesDatalist places={places} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Morning airport run)" required className={field} />
        <input value={pickup} onChange={(e) => setPickup(e.target.value)} list={PLACES_LIST_ID} autoComplete="off" placeholder="Pickup" required className={field} />
        <input value={dropoff} onChange={(e) => setDropoff(e.target.value)} list={PLACES_LIST_ID} autoComplete="off" placeholder="Drop-off" required className={field} />
        <label className="text-xs font-medium">
          Departs (local time)
          <input value={time} onChange={(e) => setTime(e.target.value)} type="time" required className={`mt-1 block w-full ${field}`} />
        </label>
        <input value={passengers} onChange={(e) => setPassengers(e.target.value)} type="number" min={1} placeholder="Seats" className={field} />
        <select value={taskType} onChange={(e) => setTaskType(e.target.value as TransportTaskType)} className={field}>
          {(Object.keys(TASK_TYPE_LABEL) as TransportTaskType[]).map((t) => (
            <option key={t} value={t}>
              {TASK_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <LazySelect
          value={driverId || null}
          options={drivers}
          getOptionValue={(d) => d.id}
          getOptionLabel={(d) => d.full_name}
          placeholder="Driver (optional, assigned each day)"
          className={field}
          onChange={(v) => setDriverId(v ?? "")}
        />
        <LazySelect
          value={vehicleId || null}
          options={vehicles}
          getOptionValue={(v) => v.id}
          getOptionLabel={(v) => v.name}
          placeholder="Vehicle (optional)"
          className={field}
          onChange={(v) => setVehicleId(v ?? "")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium">Runs on</span>
        {DAY_LABELS.map((label, d) => (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-medium",
              days.includes(d) ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">{describeDays(days)}</span>
      </div>
      <Button type="submit" disabled={pending || days.length === 0}>
        Add shuttle
      </Button>
    </form>
  );
}
