"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { MapPin, Truck, UserPlus, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LazySelect } from "@/components/ui/lazy-select";
import { FUEL_LABEL, VEHICLE_STATUS_LABEL, type Driver, type Place, type Vehicle, type VehicleFuel, type VehicleStatus } from "@/types/transport";
import { assigneeLabel, poolFirst } from "@/lib/transport/vehicles";
import { addDriver, addPlace, addVehicle, linkDriverProfile, removePlace, setDriverActive, setDriverDuty, setVehicleStatus, updateVehicle } from "../actions";

const field = "rounded-md border bg-background px-3 py-2 text-sm";

type Runner = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;

/**
 * The fleet, out of the dispatch board's way: vehicles and their status,
 * drivers with their portal account, duty and active flags, and the saved
 * places every form offers. Setting a driver off duty keeps them off the
 * top of the assign lists; retiring them takes them off the lists entirely
 * without losing their history.
 */
export function FleetPanel({
  drivers,
  vehicles,
  profiles,
  places,
  approvalOn,
}: {
  drivers: (Driver & { is_active: boolean })[];
  vehicles: Vehicle[];
  profiles: { id: string; full_name: string }[];
  places: Place[];
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
      <VehiclesSection vehicles={vehicles} profiles={profiles} pending={pending} run={run} />
      <PlacesSection places={places} pending={pending} run={run} />
    </div>
  );
}

function PlacesSection({ places, pending, run }: { places: Place[]; pending: boolean; run: Runner }) {
  const [name, setName] = useState("");

  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <MapPin className="h-4 w-4" /> Saved places ({places.length})
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        The usual pickup and drop-off points. Forms offer them as you type, and a request that names one
        takes this spelling, so the planner and the reports count one place once.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {places.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs">
            {p.name}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm(`Forget "${p.name}"? Requests that name it keep their text.`)) run(() => removePlace(p.id));
              }}
              className="ml-0.5 text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${p.name}`}
              title="Remove"
            >
              ×
            </button>
          </span>
        ))}
        {places.length === 0 && <p className="text-xs text-muted-foreground">No saved places yet.</p>}
      </div>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => addPlace(name),
            () => setName(""),
          );
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New place (e.g. Douala airport)" required className={field} />
        <Button type="submit" variant="outline" disabled={pending}>
          Save place
        </Button>
      </form>
    </section>
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

/**
 * The fleet register. Pool vehicles come first, then the ones assigned to a
 * post or a person; each row opens into a form to change its details or
 * its assignee, and the status select stays on the row.
 */
function VehiclesSection({
  vehicles,
  profiles,
  pending,
  run,
}: {
  vehicles: Vehicle[];
  profiles: { id: string; full_name: string }[];
  pending: boolean;
  run: Runner;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const live = vehicles.filter((v) => v.status !== "retired");
  const retired = vehicles.filter((v) => v.status === "retired");
  const pool = live.filter((v) => !v.assigned_to).length;

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Truck className="h-4 w-4" /> Vehicles ({live.length} in service · {pool} in the pool · {live.length - pool} assigned)
        </h3>
        <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={pending} onClick={() => setAdding((a) => !a)}>
          {adding ? "Close" : "Add vehicle"}
        </Button>
      </div>
      {adding && (
        <VehicleForm
          profiles={profiles}
          pending={pending}
          submitLabel="Add vehicle"
          onSubmit={(input, done) => run(() => addVehicle(input), () => { done(); setAdding(false); })}
          onCancel={() => setAdding(false)}
        />
      )}
      <div className="mt-3 space-y-2">
        {[...poolFirst(live), ...poolFirst(retired)].map((v) =>
          editing === v.id ? (
            <VehicleForm
              key={v.id}
              vehicle={v}
              profiles={profiles}
              pending={pending}
              submitLabel="Save"
              onSubmit={(input) => run(() => updateVehicle(v.id, input), () => setEditing(null))}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div key={v.id} className={cn("flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm", v.status === "retired" && "opacity-60")}>
              <span className="font-medium">{v.name}</span>
              {v.plate && <span className="text-xs text-muted-foreground">{v.plate}</span>}
              <span className="text-xs text-muted-foreground">
                · {v.capacity} seats{v.fuel ? ` · ${FUEL_LABEL[v.fuel]}` : ""}
              </span>
              {assigneeLabel(v) ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{assigneeLabel(v)}</span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">Pool</span>
              )}
              <span className="ml-auto flex items-center gap-2">
                <button type="button" className="text-xs underline-offset-2 hover:underline" disabled={pending} onClick={() => setEditing(v.id)}>
                  Edit
                </button>
                <select
                  value={v.status}
                  disabled={pending}
                  onChange={(e) => run(() => setVehicleStatus(v.id, e.target.value as VehicleStatus))}
                  className="rounded-md border bg-background px-1.5 py-1 text-xs"
                >
                  {(Object.keys(VEHICLE_STATUS_LABEL) as VehicleStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {VEHICLE_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </span>
            </div>
          ),
        )}
        {vehicles.length === 0 && <p className="text-xs text-muted-foreground">No vehicles yet.</p>}
      </div>
    </section>
  );
}

type VehicleFormInput = { name: string; plate: string; capacity: number; fuel: string; assigned_to: string; holder_id: string | null };

/** Add or edit a vehicle: name, plate, seats, fuel, the post it is assigned to (blank = pool) and who holds it. */
function VehicleForm({
  vehicle,
  profiles,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  vehicle?: Vehicle;
  profiles: { id: string; full_name: string }[];
  pending: boolean;
  submitLabel: string;
  onSubmit: (input: VehicleFormInput, reset: () => void) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(vehicle?.name ?? "");
  const [plate, setPlate] = useState(vehicle?.plate ?? "");
  const [capacity, setCapacity] = useState(String(vehicle?.capacity ?? 4));
  const [fuel, setFuel] = useState<string>(vehicle?.fuel ?? "");
  const [assignedTo, setAssignedTo] = useState(vehicle?.assigned_to ?? "");
  const [holderId, setHolderId] = useState<string | null>(vehicle?.holder_id ?? null);
  const reset = () => {
    setName("");
    setPlate("");
    setCapacity("4");
    setFuel("");
    setAssignedTo("");
    setHolderId(null);
  };
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, plate, capacity: Number(capacity), fuel, assigned_to: assignedTo, holder_id: holderId }, reset);
      }}
    >
      <label className="flex flex-col gap-1 text-xs">
        Vehicle
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Toyota Prado" required className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Plate
        <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="CE.303.MS" className={`${field} w-32`} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Seats
        <input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" min={1} className={`${field} w-20`} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Fuel
        <select value={fuel} onChange={(e) => setFuel(e.target.value)} className={field}>
          <option value="">—</option>
          {(Object.keys(FUEL_LABEL) as VehicleFuel[]).map((f) => (
            <option key={f} value={f}>
              {FUEL_LABEL[f]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs">
        Assigned to (post)
        <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Blank = pool vehicle" className={field} />
      </label>
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs">
        Holder (person)
        <LazySelect
          value={holderId}
          options={profiles}
          getOptionValue={(p) => p.id}
          getOptionLabel={(p) => p.full_name ?? ""}
          placeholder="Nobody named"
          className={field}
          onChange={(v) => setHolderId(v)}
        />
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        {submitLabel}
      </Button>
      <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
