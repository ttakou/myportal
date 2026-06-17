"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import {
  CheckCircle2,
  MapPin,
  Plane,
  PlaneLanding,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/components/permissions-provider";
import {
  AIRPORT_STATUS_LABEL,
  PICKUP_STATUS_LABEL,
  APPROVAL_TRAVEL_TYPES,
  CHECKIN_KIND_LABEL,
  FLIGHT_STATUS_LABEL,
  TRAVEL_TYPE_LABEL,
  TRAVELER_TYPE_LABEL,
  TRIP_PHASE_LABEL,
  TRIP_STATUS_LABEL,
  type TravelerType,
  type TravelType,
  type Trip,
  type TripPhase,
  type TripStatus,
} from "@/types/trips";
import {
  createTrip,
  managerApproveTrip,
  rejectTrip,
  requestAirportAssistance,
  tripCheckin,
} from "../actions";

const STATUS_STYLE: Record<TripStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-amber-100 text-amber-700",
  manager_approved: "bg-green-100 text-green-700",
  finance_approved: "bg-green-100 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
  completed: "bg-green-100 text-green-700",
};

const PHASE_STYLE: Record<TripPhase, string> = {
  declared: "bg-muted text-muted-foreground",
  departed: "bg-sky-100 text-sky-700",
  arrived: "bg-primary/10 text-primary",
  returned: "bg-green-100 text-green-700",
};

const TRAVEL_TYPES = Object.keys(TRAVEL_TYPE_LABEL) as TravelType[];

export function TripsBoard({
  mine,
  queue,
  canApprove,
}: {
  mine: Trip[];
  queue: Trip[];
  canApprove: boolean;
}) {
  const { can } = usePermissions();
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);

  const [travelType, setTravelType] = useState<TravelType>("business");
  const [travelerType, setTravelerType] = useState<TravelerType>("employee");
  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState("");
  const [route, setRoute] = useState("");
  const [transport, setTransport] = useState("");
  const [accommodation, setAccommodation] = useState("");
  const [contact, setContact] = useState("");
  const [destContact, setDestContact] = useState("");
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [airline, setAirline] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [terminal, setTerminal] = useState("");
  const [flightArrival, setFlightArrival] = useState("");

  const needsApproval = APPROVAL_TRAVEL_TYPES.includes(travelType);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed.");
      else onOk?.();
    });
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      {/* Declaration */}
      {can("out-of-town", "create") && (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Declare a trip</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                createTrip({
                  travelType,
                  travelerType,
                  destination,
                  purpose,
                  route,
                  transportMode: transport,
                  accommodation,
                  contactNumber: contact,
                  destEmergencyContact: destContact,
                  departDate,
                  returnDate,
                  airline,
                  flightNumber,
                  terminal,
                  flightArrivalAt: flightArrival
                    ? new Date(flightArrival).toISOString()
                    : undefined,
                }),
              () => {
                setDestination("");
                setPurpose("");
                setRoute("");
                setTransport("");
                setAccommodation("");
                setContact("");
                setDestContact("");
                setDepartDate("");
                setReturnDate("");
                setAirline("");
                setFlightNumber("");
                setTerminal("");
                setFlightArrival("");
                setTravelerType("employee");
              },
            );
          }}
          className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <label className="text-xs text-muted-foreground">
            Travel type
            <select
              value={travelType}
              onChange={(e) => setTravelType(e.target.value as TravelType)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {TRAVEL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TRAVEL_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Traveller
            <select
              value={travelerType}
              onChange={(e) => setTravelerType(e.target.value as TravelerType)}
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {(Object.keys(TRAVELER_TYPE_LABEL) as TravelerType[]).map((t) => (
                <option key={t} value={t}>
                  {TRAVELER_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Destination (city/country)" required className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Route (e.g. Douala → Kribi)" className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="Transport (car, flight, boat…)" className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Reason / purpose" className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input value={accommodation} onChange={(e) => setAccommodation(e.target.value)} placeholder="Accommodation (hotel, address)" className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Your contact number while away" className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input value={destContact} onChange={(e) => setDestContact(e.target.value)} placeholder="Emergency contact at destination" className="rounded-md border bg-background px-3 py-2 text-sm" />
          <label className="text-xs text-muted-foreground">
            Departure
            <input value={departDate} onChange={(e) => setDepartDate(e.target.value)} type="date" required className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Return
            <input value={returnDate} onChange={(e) => setReturnDate(e.target.value)} type="date" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
          </label>
          <input value={airline} onChange={(e) => setAirline(e.target.value)} placeholder="Airline (optional)" className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} placeholder="Flight no. (e.g. ET925)" className="rounded-md border bg-background px-3 py-2 text-sm" />
          <input value={terminal} onChange={(e) => setTerminal(e.target.value)} placeholder="Terminal" className="rounded-md border bg-background px-3 py-2 text-sm" />
          <label className="text-xs text-muted-foreground">
            Flight arrival
            <input value={flightArrival} onChange={(e) => setFlightArrival(e.target.value)} type="datetime-local" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={pending} className="w-full">
              <Plane className="h-4 w-4" /> Declare trip
            </Button>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
            {needsApproval
              ? "Business travel needs supervisor approval before departure."
              : "Personal/leave travel is recorded as a safety declaration — no approval needed."}
          </p>
        </form>
      </section>
      )}

      {/* Approvals (managers / admins) */}
      {(canApprove || queue.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Approvals</h2>
          <div className="space-y-2">
            {queue.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div>
                  <p className="font-medium">
                    {t.destination}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      · {t.requester_name} · {TRAVEL_TYPE_LABEL[t.travel_type]}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.depart_date}
                    {t.return_date ? ` → ${t.return_date}` : ""}
                    {t.route ? ` · ${t.route}` : ""}
                    {t.purpose ? ` · ${t.purpose}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={t.status} />
                  {t.status === "submitted" && (
                    <Button size="sm" disabled={pending} onClick={() => run(() => managerApproveTrip(t.id))}>
                      Approve
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => { const r = window.prompt("Reason for rejection") ?? ""; run(() => rejectTrip(t.id, r)); }}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
            {queue.length === 0 && <p className="text-sm text-muted-foreground">Nothing awaiting your approval.</p>}
          </div>
        </section>
      )}

      {/* My trips */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My trips</h2>
        <div className="space-y-3">
          {mine.map((t) => (
            <TripCard key={t.id} trip={t} pending={pending} run={run} />
          ))}
          {mine.length === 0 && <p className="text-sm text-muted-foreground">No trips declared yet.</p>}
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: TripStatus }) {
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-medium", STATUS_STYLE[status])}>
      {TRIP_STATUS_LABEL[status]}
    </span>
  );
}

function PhaseBadge({ phase }: { phase: TripPhase }) {
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-medium", PHASE_STYLE[phase])}>
      {TRIP_PHASE_LABEL[phase]}
    </span>
  );
}

function TripCard({
  trip,
  pending,
  run,
}: {
  trip: Trip;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => void;
}) {
  const approved = ["manager_approved", "finance_approved", "completed"].includes(trip.status);
  const active = trip.phase === "departed" || trip.phase === "arrived";

  function check(kind: "departed" | "arrived" | "safe" | "returned" | "help") {
    const note =
      kind === "help"
        ? window.prompt("Describe what you need (optional)") ?? undefined
        : undefined;
    run(() => tripCheckin({ tripId: trip.id, kind, note: note ?? undefined }));
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {trip.destination}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              · {TRAVEL_TYPE_LABEL[trip.travel_type]}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {trip.depart_date}
            {trip.return_date ? ` → ${trip.return_date}` : ""}
            {trip.route ? ` · ${trip.route}` : ""}
            {trip.transport_mode ? ` · ${trip.transport_mode}` : ""}
          </p>
          {(trip.accommodation || trip.contact_number) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {trip.accommodation ? `Stay: ${trip.accommodation}` : ""}
              {trip.accommodation && trip.contact_number ? " · " : ""}
              {trip.contact_number ? `Tel: ${trip.contact_number}` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={trip.status} />
          <PhaseBadge phase={trip.phase} />
        </div>
      </div>

      {trip.status === "rejected" && trip.rejection_reason && (
        <p className="mt-2 text-sm text-destructive">Rejected: {trip.rejection_reason}</p>
      )}

      {/* Safety check-ins */}
      {trip.status !== "rejected" && trip.phase !== "returned" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          {trip.phase === "declared" && (
            <Button size="sm" disabled={pending || !approved} onClick={() => check("departed")}>
              <Plane className="h-4 w-4" /> Departed
            </Button>
          )}
          {!approved && trip.phase === "declared" && (
            <span className="text-xs text-muted-foreground">Awaiting supervisor approval to depart.</span>
          )}
          {trip.phase === "departed" && (
            <Button size="sm" disabled={pending} onClick={() => check("arrived")}>
              <MapPin className="h-4 w-4" /> Arrived safely
            </Button>
          )}
          {active && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => check("returned")}>
              <CheckCircle2 className="h-4 w-4" /> Returned
            </Button>
          )}
          {active && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => check("safe")}>
              <ShieldCheck className="h-4 w-4" /> I&apos;m safe
            </Button>
          )}
          {active && (
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => check("help")}>
              <TriangleAlert className="h-4 w-4" /> I need help
            </Button>
          )}
        </div>
      )}

      {(trip.assigned_driver_name || trip.assigned_vehicle) && (
        <p className="mt-2 text-sm">
          <span className="text-muted-foreground">Driver:</span>{" "}
          <span className="font-medium">{trip.assigned_driver_name ?? "TBC"}</span>
          {trip.assigned_driver_phone ? ` · ${trip.assigned_driver_phone}` : ""}
          {trip.assigned_vehicle ? ` · ${trip.assigned_vehicle}` : ""}
        </p>
      )}

      {/* Meet & greet / airport assistance */}
      {trip.assistance ? (
        <div className="mt-3 rounded-md bg-primary/5 p-3 text-sm">
          <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <PlaneLanding className="h-3.5 w-3.5" /> Airport assistance ·{" "}
            <span className="font-semibold normal-case text-foreground">
              {AIRPORT_STATUS_LABEL[trip.assistance.status]}
            </span>
            {trip.assistance.vip && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                VIP
              </span>
            )}
          </p>
          {(trip.airline || trip.flight_number) && (
            <p className="text-xs text-muted-foreground">
              Flight: {[trip.airline, trip.flight_number].filter(Boolean).join(" ")}
              {trip.terminal ? ` · Terminal ${trip.terminal}` : ""} ·{" "}
              {FLIGHT_STATUS_LABEL[trip.flight_status]}
              {trip.flight_arrival_at
                ? ` · ${new Date(trip.flight_arrival_at).toLocaleString()}`
                : ""}
            </p>
          )}
          {trip.assistance.greeter_name && (
            <p>
              Greeter: <span className="font-medium">{trip.assistance.greeter_name}</span>
              {trip.assistance.greeter_phone ? ` · ${trip.assistance.greeter_phone}` : ""}
            </p>
          )}
          {trip.assistance.driver_name && (
            <p>
              Driver: <span className="font-medium">{trip.assistance.driver_name}</span>
              {trip.assistance.driver_phone ? ` · ${trip.assistance.driver_phone}` : ""}
              {trip.assistance.vehicle ? ` · ${trip.assistance.vehicle}` : ""}
            </p>
          )}
          {trip.assistance.meeting_point && (
            <p className="text-muted-foreground">Meet at: {trip.assistance.meeting_point}</p>
          )}
          {trip.assistance.pickup_task && (
            <p>
              Pickup ({PICKUP_STATUS_LABEL[trip.assistance.pickup_task.status]})
              {trip.assistance.pickup_task.driver_name ? (
                <>
                  : <span className="font-medium">{trip.assistance.pickup_task.driver_name}</span>
                  {trip.assistance.pickup_task.driver_phone
                    ? ` · ${trip.assistance.pickup_task.driver_phone}`
                    : ""}
                  {trip.assistance.pickup_task.vehicle_name
                    ? ` · ${trip.assistance.pickup_task.vehicle_name}`
                    : ""}
                </>
              ) : null}
            </p>
          )}
          {!trip.assistance.greeter_name &&
            !trip.assistance.driver_name &&
            !trip.assistance.pickup_task?.driver_name && (
              <p className="text-xs text-muted-foreground">
                Requested — the travel desk will assign a greeter and driver.
              </p>
            )}
        </div>
      ) : (
        trip.status !== "rejected" &&
        trip.phase !== "returned" && (
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => requestAirportAssistance({ tripId: trip.id }))}
            >
              <PlaneLanding className="h-4 w-4" /> Request meet &amp; greet
            </Button>
          </div>
        )
      )}

      {trip.checkins.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Last check-in: {CHECKIN_KIND_LABEL[trip.checkins[0].kind]}
          {trip.last_checkin_at
            ? ` · ${new Date(trip.last_checkin_at).toLocaleString()}`
            : ""}
        </p>
      )}
    </div>
  );
}
