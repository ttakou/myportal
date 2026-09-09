"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Truck, UserPlus, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LazySelect } from "@/components/ui/lazy-select";
import { VEHICLE_STATUS_LABEL, type Driver, type Vehicle, type VehicleStatus } from "@/types/transport";
import { addDriver, addVehicle, linkDriverProfile, setDriverActive, setDriverDuty, setVehicleStatus } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

type Runner = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;

/**
 * The fleet, out of the dispatch board's way: vehicles and their status,
 * drivers with their portal account, duty and active flags. Setting a
 * driver off duty keeps them off the top of the assign lists; retiring
 * them takes them off the lists entirely without losing their history.
 */
export function FleetPanel({
  drivers,
  vehicles,
  profiles,
  approvalOn,
}: {
  drivers: (Driver & { is_active: boolean })[];
  vehicles: Vehicle[];
  profiles: { id: string; full_name: string }[];
  approvalOn: boolean;
}) {
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const run: Runner = (fn, onOk) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Wrench className="h-5 w-5 text-primary" /> Vehicles &amp; drivers
        </h2>
        <p className="text-sm text-muted-foreground">
          Who and what the dispatch desk can send. Line-manager approval of requests is{" "}
          <strong>{approvalOn ? "on" : "off"}</strong>; an admin changes it under Admin Center › Modules › Transportation.
        </p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <DriversSection drivers={drivers} profiles={profiles} pending={pending} run={run} />
      <VehiclesSection vehicles={vehicles} pending={pending} run={run} />
    </div>
  );
}

function DriversSection({
  drivers,
  profiles,
  pending,
  run,
}: {
  drivers: (Driver & { is_active: boolean })[];
  profiles: { id: string; full_name: string }[];
  pending: boolean;
  run: Runner;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileId, setProfileId] = useState("");
  const active = drivers.filter((d) => d.is_active);
  const retired = drivers.filter((d) => !d.is_active);

  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <UserPlus className="h-4 w-4" /> Drivers ({active.length} active)
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Link a driver to a portal account so they see and update their own tasks live. Off duty keeps them
        at the bottom of the assign lists; retired takes them off.
      </p>
      <div className="mt-3 space-y-2">
        {active.map((d) => (
          <DriverRow key={d.id} d={d} profiles={profiles} pending={pending} run={run} />
        ))}
        {active.length === 0 && <p className="text-xs text-muted-foreground">No active drivers.</p>}
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
        <LazySelect
          value={profileId || null}
          options={profiles}
          getOptionValue={(p) => p.id}
          getOptionLabel={(p) => p.full_name}
          placeholder="Portal account (optional)"
          className={field}
          onChange={(v) => setProfileId(v ?? "")}
        />
        <Button type="submit" variant="outline" disabled={pending}>
          Add driver
        </Button>
      </form>
      {retired.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Retired ({retired.length})</summary>
          <div className="mt-2 space-y-2">
            {retired.map((d) => (
              <DriverRow key={d.id} d={d} profiles={profiles} pending={pending} run={run} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function DriverRow({
  d,
  profiles,
  pending,
  run,
}: {
  d: Driver & { is_active: boolean };
  profiles: { id: string; full_name: string }[];
  pending: boolean;
  run: Runner;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm", !d.is_active && "opacity-60")}>
      <span className="font-medium">{d.full_name}</span>
      {d.phone && <span className="text-xs text-muted-foreground">{d.phone}</span>}
      <button
        type="button"
        disabled={pending || !d.is_active}
        onClick={() => run(() => setDriverDuty(d.id, !d.on_duty))}
        className={cn(
          "rounded-full border px-2 py-0.5 text-[11px] font-medium",
          d.on_duty ? "border-green-200 bg-green-50 text-green-800" : "bg-muted text-muted-foreground",
        )}
        title="Toggle duty"
      >
        {d.on_duty ? "On duty" : "Off duty"}
      </button>
      <span className="ml-auto flex items-center gap-2">
        <LazySelect
          value={d.profile_id ?? null}
          options={profiles}
          getOptionValue={(p) => p.id}
          getOptionLabel={(p) => p.full_name ?? ""}
          placeholder="No portal account"
          disabled={pending}
          className="rounded-md border bg-background px-1.5 py-1 text-xs"
          onChange={(v) => run(() => linkDriverProfile(d.id, v))}
        />
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setDriverActive(d.id, !d.is_active))}>
          {d.is_active ? "Retire" : "Reinstate"}
        </Button>
      </span>
    </div>
  );
}

function VehiclesSection({ vehicles, pending, run }: { vehicles: Vehicle[]; pending: boolean; run: Runner }) {
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [capacity, setCapacity] = useState("4");

  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Truck className="h-4 w-4" /> Vehicles ({vehicles.filter((v) => v.status === "active").length} active)
      </h3>
      <div className="mt-3 space-y-2">
        {vehicles.map((v) => (
          <div key={v.id} className={cn("flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm", v.status === "retired" && "opacity-60")}>
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
        {vehicles.length === 0 && <p className="text-xs text-muted-foreground">No vehicles yet.</p>}
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
    </section>
  );
}
