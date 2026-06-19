"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { Car, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/components/permissions-provider";
import {
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

export function VisitorsBoard({
  visitDate,
  visitors,
  isAdmin,
}: {
  visitDate: string;
  visitors: Visitor[];
  isAdmin: boolean;
}) {
  const { can } = usePermissions();
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [purpose, setPurpose] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");

  // Reception check-in dialog (captures badge + vehicle type/plate on arrival).
  const [checkIn, setCheckIn] = useState<Visitor | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  function register(e: React.FormEvent) {
    e.preventDefault();
    run(
      () => preRegisterVisitor({ fullName, company, purpose, visitDate, vehicleType, vehiclePlate }),
      () => {
        setFullName("");
        setCompany("");
        setPurpose("");
        setVehicleType("");
        setVehiclePlate("");
      },
    );
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
        <Button type="submit" disabled={pending}>
          <UserPlus className="h-4 w-4" /> Pre-register
        </Button>
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
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visitors.map((v) => {
              const vehicle = vehicleLabel(v);
              return (
              <tr key={v.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{v.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[v.company, v.purpose].filter(Boolean).join(" · ") || "—"}
                    {v.badge_no && ` · Badge ${v.badge_no}`}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{v.host_name ?? "—"}</td>
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
                        {isAdmin && (
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() => setCheckIn(v)}
                          >
                            Check in
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
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No visitors for this date yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
  onSubmit: (opts: { badgeNo?: string; vehicleType?: string; vehiclePlate?: string }) => void;
}) {
  const [badgeNo, setBadgeNo] = useState(visitor.badge_no ?? "");
  const [vehicleType, setVehicleType] = useState(visitor.vehicle_type ?? "");
  const [vehiclePlate, setVehiclePlate] = useState(visitor.vehicle_plate ?? "");

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
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={pending}
            onClick={() => onSubmit({ badgeNo, vehicleType, vehiclePlate })}
          >
            {pending ? "Checking in…" : "Check in"}
          </Button>
        </div>
      </div>
    </div>
  );
}
