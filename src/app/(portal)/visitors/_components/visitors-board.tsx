"use client";

import { useEffect, useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Car, UserCheck, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import { usePermissions } from "@/components/permissions-provider";
import {
  accompanyingSummary,
  accompanyingTotal,
  VEHICLE_TYPES,
  VISITOR_STATUS_LABEL,
  type Visitor,
  type VisitorStatus,
} from "@/types/visitors";
import {
  cancelVisitor,
  checkInVisitor,
  checkOutVisitor,
  preRegisterVisitor,
  searchHosts,
  updateVisitorMinors,
  type HostOption,
} from "../actions";

const STATUS_STYLE: Record<VisitorStatus, string> = {
  pre_registered: "bg-muted text-muted-foreground",
  checked_in: "bg-primary/10 text-primary",
  checked_out: "bg-secondary text-secondary-foreground",
  cancelled: "bg-destructive/10 text-destructive line-through",
};

function vehicleLabel(v: Visitor): string | null {
  return [v.vehicle_type, v.vehicle_plate].filter(Boolean).join(" · ") || null;
}

/** A small labelled 0–50 counter for an accompanying-minor age band. */
function MinorCount({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        min={0}
        max={50}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
      />
    </label>
  );
}

export function VisitorsBoard({
  visitDate,
  visitors,
  isAdmin,
  departments,
}: {
  visitDate: string;
  visitors: Visitor[];
  isAdmin: boolean;
  departments: string[];
}) {
  const { can } = usePermissions();
  // Front-line reception/security: may check visitors in and out.
  const canOperate = isAdmin || can("visitors", "operate");
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [purpose, setPurpose] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  // Accompanying minors, by age band — captured for security/muster headcount.
  const [infants, setInfants] = useState("");
  const [children, setChildren] = useState("");
  const [adolescents, setAdolescents] = useState("");
  // Assign the visit to an individual host and/or a department/service.
  const [service, setService] = useState("");
  const [hostId, setHostId] = useState<string | null>(null);
  const [hostQuery, setHostQuery] = useState("");
  const [hostOptions, setHostOptions] = useState<HostOption[]>([]);
  const [showHosts, setShowHosts] = useState(false);

  // Debounced host directory search as the user types a name.
  useEffect(() => {
    if (hostId) return; // a host is already chosen
    const q = hostQuery.trim();
    if (q.length < 2) {
      setHostOptions([]);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      const res = await searchHosts(q);
      if (active) {
        setHostOptions(res);
        setShowHosts(true);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [hostQuery, hostId]);

  function resetForm() {
    setFullName("");
    setCompany("");
    setPurpose("");
    setVehicleType("");
    setVehiclePlate("");
    setInfants("");
    setChildren("");
    setAdolescents("");
    setService("");
    setHostId(null);
    setHostQuery("");
    setHostOptions([]);
  }

  // Reception check-in dialog (captures badge + vehicle type/plate on arrival).
  const [checkIn, setCheckIn] = useState<Visitor | null>(null);
  // Correct accompanying-minor counts on an existing (e.g. pre-registered) visitor.
  const [editMinors, setEditMinors] = useState<Visitor | null>(null);

  const { count, hasMore, remaining, showMore, sentinelRef } = useProgressiveReveal(
    visitors.length,
  );

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  function submit(checkInNow: boolean) {
    run(
      () =>
        preRegisterVisitor({
          fullName,
          company,
          purpose,
          visitDate,
          vehicleType,
          vehiclePlate,
          infants: Number(infants) || 0,
          children: Number(children) || 0,
          adolescents: Number(adolescents) || 0,
          hostId,
          service,
          checkInNow,
        }),
      resetForm,
    );
  }

  function register(e: React.FormEvent) {
    e.preventDefault();
    submit(false);
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {can("visitors", "create") && (
      <form
        onSubmit={register}
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Visitor name"
          required
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <input
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="Purpose of visit"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <select
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">Vehicle type (optional)</option>
          {VEHICLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={vehiclePlate}
          onChange={(e) => setVehiclePlate(e.target.value)}
          placeholder="Vehicle plate (optional)"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        {/* Assign to an individual host (employee directory typeahead). */}
        <div className="relative">
          {hostId ? (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-1.5 truncate">
                <UserCheck className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{hostQuery || "Host"}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setHostId(null);
                  setHostQuery("");
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Clear host"
              >
                ×
              </button>
            </div>
          ) : (
            <input
              value={hostQuery}
              onChange={(e) => setHostQuery(e.target.value)}
              onFocus={() => hostOptions.length > 0 && setShowHosts(true)}
              onBlur={() => setTimeout(() => setShowHosts(false), 150)}
              placeholder="Assign to host (optional)"
              autoComplete="off"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          )}
          {showHosts && !hostId && hostOptions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
              {hostOptions.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setHostId(h.id);
                      setHostQuery(h.name);
                      setShowHosts(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="truncate font-medium">{h.name}</span>
                    {h.department && (
                      <span className="shrink-0 text-xs text-muted-foreground">{h.department}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* Assign to a department / service. */}
        <select
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">Assign to service (optional)</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <fieldset className="grid grid-cols-3 gap-2 sm:col-span-2 lg:col-span-3">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">
            Accompanying minors (optional)
          </legend>
          <MinorCount label="Infants" value={infants} onChange={setInfants} />
          <MinorCount label="Children" value={children} onChange={setChildren} />
          <MinorCount label="Adolescents" value={adolescents} onChange={setAdolescents} />
        </fieldset>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={pending}>
            <UserPlus className="h-4 w-4" /> Pre-register
          </Button>
          {canOperate && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => submit(true)}
              title="Register a walk-in who is already here, and check them in now"
            >
              <UserCheck className="h-4 w-4" /> Register &amp; check in
            </Button>
          )}
        </div>
      </form>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Visitor</th>
              <th className="px-4 py-3 font-medium">Host</th>
              <th className="px-4 py-3 font-medium">Vehicle</th>
              <th className="px-4 py-3 font-medium">Arrival</th>
              <th className="px-4 py-3 font-medium">Checkout</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visitors.slice(0, count).map((v) => {
              const vehicle = vehicleLabel(v);
              return (
              <tr key={v.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{v.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[v.company, v.purpose].filter(Boolean).join(" · ") || "—"}
                    {v.badge_no && ` · Badge ${v.badge_no}`}
                  </div>
                  {accompanyingTotal(v) > 0 && (
                    <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                      <Users className="h-3 w-3" /> +{accompanyingTotal(v)} minor
                      {accompanyingTotal(v) === 1 ? "" : "s"} ({accompanyingSummary(v)})
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <span className="block">{v.host_name ?? "—"}</span>
                  {v.service && <span className="block text-xs">{v.service}</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {vehicle ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Car className="h-3.5 w-3.5 shrink-0" />
                      {vehicle}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {v.check_in_at ? new Date(v.check_in_at).toLocaleTimeString() : "—"}
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {v.check_out_at ? new Date(v.check_out_at).toLocaleTimeString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2.5 py-1 text-xs font-medium",
                      STATUS_STYLE[v.status],
                    )}
                  >
                    {VISITOR_STATUS_LABEL[v.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {v.status === "pre_registered" && (
                      <>
                        {canOperate && (
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() => setCheckIn(v)}
                          >
                            Check in
                          </Button>
                        )}
                        {canOperate && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => setEditMinors(v)}
                          >
                            Edit minors
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => run(() => cancelVisitor(v.id))}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                    {v.status === "checked_in" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => checkOutVisitor(v.id))}
                      >
                        Check out
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
            {visitors.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No visitors for this date yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ShowMore
        ref={sentinelRef}
        hasMore={hasMore}
        remaining={remaining}
        onClick={showMore}
        label="Show more visitors"
      />

      {checkIn && (
        <CheckInDialog
          visitor={checkIn}
          pending={pending}
          onCancel={() => setCheckIn(null)}
          onSubmit={(opts) =>
            run(() => checkInVisitor(checkIn.id, opts), () => setCheckIn(null))
          }
        />
      )}

      {editMinors && (
        <EditMinorsDialog
          visitor={editMinors}
          pending={pending}
          onCancel={() => setEditMinors(null)}
          onSubmit={(counts) =>
            run(() => updateVisitorMinors(editMinors.id, counts), () => setEditMinors(null))
          }
        />
      )}
    </div>
  );
}

function EditMinorsDialog({
  visitor,
  pending,
  onCancel,
  onSubmit,
}: {
  visitor: Visitor;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (counts: { infants: number; children: number; adolescents: number }) => void;
}) {
  const [infants, setInfants] = useState(
    visitor.accompanying_infants ? String(visitor.accompanying_infants) : "",
  );
  const [children, setChildren] = useState(
    visitor.accompanying_children ? String(visitor.accompanying_children) : "",
  );
  const [adolescents, setAdolescents] = useState(
    visitor.accompanying_adolescents ? String(visitor.accompanying_adolescents) : "",
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl">
        <h3 className="text-lg font-semibold">Accompanying minors — {visitor.full_name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Correct the headcount recorded at pre-registration.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <MinorCount label="Infants" value={infants} onChange={setInfants} />
          <MinorCount label="Children" value={children} onChange={setChildren} />
          <MinorCount label="Adolescents" value={adolescents} onChange={setAdolescents} />
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={pending}
            onClick={() =>
              onSubmit({
                infants: Number(infants) || 0,
                children: Number(children) || 0,
                adolescents: Number(adolescents) || 0,
              })
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CheckInDialog({
  visitor,
  pending,
  onCancel,
  onSubmit,
}: {
  visitor: Visitor;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (opts: {
    badgeNo?: string;
    vehicleType?: string;
    vehiclePlate?: string;
    infants?: number;
    children?: number;
    adolescents?: number;
  }) => void;
}) {
  const [badgeNo, setBadgeNo] = useState(visitor.badge_no ?? "");
  const [vehicleType, setVehicleType] = useState(visitor.vehicle_type ?? "");
  const [vehiclePlate, setVehiclePlate] = useState(visitor.vehicle_plate ?? "");
  // Pre-filled from the pre-registration; editable because minors are often only
  // known on arrival.
  const [infants, setInfants] = useState(
    visitor.accompanying_infants ? String(visitor.accompanying_infants) : "",
  );
  const [children, setChildren] = useState(
    visitor.accompanying_children ? String(visitor.accompanying_children) : "",
  );
  const [adolescents, setAdolescents] = useState(
    visitor.accompanying_adolescents ? String(visitor.accompanying_adolescents) : "",
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl">
        <h3 className="text-lg font-semibold">Check in {visitor.full_name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The arrival time is recorded automatically. Capture the badge and any vehicle details.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">Badge number</span>
            <input
              value={badgeNo}
              onChange={(e) => setBadgeNo(e.target.value)}
              placeholder="Optional"
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Vehicle type</span>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">None / on foot</option>
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Vehicle plate</span>
            <input
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value)}
              placeholder="Optional"
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div>
            <span className="text-sm text-muted-foreground">Accompanying minors on arrival</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <MinorCount label="Infants" value={infants} onChange={setInfants} />
              <MinorCount label="Children" value={children} onChange={setChildren} />
              <MinorCount label="Adolescents" value={adolescents} onChange={setAdolescents} />
            </div>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={pending}
            onClick={() =>
              onSubmit({
                badgeNo,
                vehicleType,
                vehiclePlate,
                infants: Number(infants) || 0,
                children: Number(children) || 0,
                adolescents: Number(adolescents) || 0,
              })
            }
          >
            {pending ? "Checking in…" : "Check in"}
          </Button>
        </div>
      </div>
    </div>
  );
}
