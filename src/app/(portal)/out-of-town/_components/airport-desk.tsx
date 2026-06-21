"use client";

import { useState } from "react";
import { useStatusTransition } from "@/components/activity";
import { PlaneTakeoff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShowMore, useProgressiveReveal } from "@/components/ui/progressive-list";
import {
  AIRPORT_SERVICE_LABEL,
  AIRPORT_STATUS_LABEL,
  FLIGHT_STATUS_LABEL,
  TRAVELER_TYPE_LABEL,
  type AirportAssistStatus,
  type AirportServiceType,
  type FlightStatus,
  type Trip,
} from "@/types/trips";
import {
  refreshFlightStatus,
  updateAirportAssistance,
  updateFlight,
  updateTripLogistics,
} from "../actions";

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AirportDesk({ trips }: { trips: Trip[] }) {
  const meetGreet = trips.filter((t) => t.assistance && t.assistance.status !== "closed");
  const reveal = useProgressiveReveal(trips.length);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <PlaneTakeoff className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Travel services desk</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {trips.length} active · {meetGreet.length} meet &amp; greet
        </span>
      </div>

      {trips.length === 0 && (
        <p className="text-sm text-muted-foreground">No active trips to service.</p>
      )}

      <div className="space-y-3">
        {trips.slice(0, reveal.count).map((t) => (
          <DeskCard key={t.id} trip={t} />
        ))}
      </div>
      <ShowMore
        ref={reveal.sentinelRef}
        hasMore={reveal.hasMore}
        remaining={reveal.remaining}
        onClick={reveal.showMore}
        label="Show more trips"
      />
    </section>
  );
}

function DeskCard({ trip }: { trip: Trip }) {
  const a = trip.assistance;
  const [pending, startTransition] = useStatusTransition("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Trip logistics
  const [accommodation, setAccommodation] = useState(trip.accommodation ?? "");
  const [tripDriverName, setTripDriverName] = useState(trip.assigned_driver_name ?? "");
  const [tripDriverPhone, setTripDriverPhone] = useState(trip.assigned_driver_phone ?? "");
  const [tripVehicle, setTripVehicle] = useState(trip.assigned_vehicle ?? "");

  // Flight
  const [airline, setAirline] = useState(trip.airline ?? "");
  const [flightNumber, setFlightNumber] = useState(trip.flight_number ?? "");
  const [terminal, setTerminal] = useState(trip.terminal ?? "");
  const [flightArrival, setFlightArrival] = useState(toLocalInput(trip.flight_arrival_at));
  const [flightStatus, setFlightStatus] = useState<FlightStatus>(trip.flight_status);

  // Meet & greet (only when requested)
  const [serviceType, setServiceType] = useState<AirportServiceType>(a?.service_type ?? "arrival");
  const [status, setStatus] = useState<AirportAssistStatus>(a?.status ?? "requested");
  const [greeterName, setGreeterName] = useState(a?.greeter_name ?? "");
  const [greeterPhone, setGreeterPhone] = useState(a?.greeter_phone ?? "");
  const [driverName, setDriverName] = useState(a?.driver_name ?? "");
  const [driverPhone, setDriverPhone] = useState(a?.driver_phone ?? "");
  const [vehicle, setVehicle] = useState(a?.vehicle ?? "");
  const [pickupPoint, setPickupPoint] = useState(a?.pickup_point ?? "");
  const [meetingPoint, setMeetingPoint] = useState(a?.meeting_point ?? "");
  const [nameBoard, setNameBoard] = useState(a?.name_board ?? false);
  const [vip, setVip] = useState(a?.vip ?? false);
  const [language, setLanguage] = useState(a?.language ?? "");
  const [notes, setNotes] = useState(a?.notes ?? "");

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r1 = await updateTripLogistics({
        tripId: trip.id,
        accommodation,
        driverName: tripDriverName,
        driverPhone: tripDriverPhone,
        vehicle: tripVehicle,
      });
      if (!r1.ok) {
        setError(r1.error ?? "Could not save logistics.");
        return;
      }
      const r2 = await updateFlight({
        tripId: trip.id,
        airline,
        flightNumber,
        terminal,
        flightArrivalAt: flightArrival ? new Date(flightArrival).toISOString() : "",
        flightStatus,
      });
      if (!r2.ok) {
        setError(r2.error ?? "Could not save flight.");
        return;
      }
      if (a) {
        const r3 = await updateAirportAssistance({
          id: a.id,
          serviceType,
          status,
          greeterName,
          greeterPhone,
          driverName,
          driverPhone,
          vehicle,
          pickupPoint,
          meetingPoint,
          nameBoard,
          vip,
          language,
          notes,
        });
        if (!r3.ok) {
          setError(r3.error ?? "Could not save meet & greet.");
          return;
        }
      }
      setSaved(true);
    });
  }

  function refreshFlight() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await refreshFlightStatus(trip.id);
      if (!r.ok) setError(r.error ?? "Could not refresh flight status.");
      else setSaved(true);
    });
  }

  const field = "rounded-md border bg-background px-3 py-2 text-sm";

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {trip.requester_name ?? "Unknown"}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              · {TRAVELER_TYPE_LABEL[trip.traveler_type]} · {trip.destination}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {trip.depart_date}
            {trip.return_date ? ` → ${trip.return_date}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {a && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Meet &amp; greet · {AIRPORT_STATUS_LABEL[a.status]}
            </span>
          )}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Flight: {FLIGHT_STATUS_LABEL[trip.flight_status]}
          </span>
        </div>
      </div>

      {/* Logistics: accommodation + assigned driver/car for the trip */}
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Logistics
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input value={accommodation} onChange={(e) => setAccommodation(e.target.value)} placeholder="Accommodation (hotel, address)" className={field} />
        <input value={tripDriverName} onChange={(e) => setTripDriverName(e.target.value)} placeholder="Assigned driver" className={field} />
        <input value={tripDriverPhone} onChange={(e) => setTripDriverPhone(e.target.value)} placeholder="Driver phone" className={field} />
        <input value={tripVehicle} onChange={(e) => setTripVehicle(e.target.value)} placeholder="Car (type · plate)" className={field} />
      </div>

      {/* Flight */}
      <div className="mb-1 mt-3 flex items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Flight</p>
        {trip.flight_checked_at && (
          <span className="text-[11px] text-muted-foreground">
            checked {new Date(trip.flight_checked_at).toLocaleString()}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          disabled={pending || !flightNumber}
          onClick={refreshFlight}
          title="Pull live status from the flight-data service"
        >
          <RefreshCw className="h-3 w-3" /> Refresh status
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input value={airline} onChange={(e) => setAirline(e.target.value)} placeholder="Airline" className={field} />
        <input value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} placeholder="Flight no." className={field} />
        <input value={terminal} onChange={(e) => setTerminal(e.target.value)} placeholder="Terminal" className={field} />
        <input type="datetime-local" value={flightArrival} onChange={(e) => setFlightArrival(e.target.value)} className={field} />
        <select value={flightStatus} onChange={(e) => setFlightStatus(e.target.value as FlightStatus)} className={field}>
          {(Object.keys(FLIGHT_STATUS_LABEL) as FlightStatus[]).map((s) => (
            <option key={s} value={s}>{FLIGHT_STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {/* Meet & greet (when the traveller requested one) */}
      {a && (
        <>
          <p className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Meet &amp; greet
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <select value={serviceType} onChange={(e) => setServiceType(e.target.value as AirportServiceType)} className={field}>
              {(Object.keys(AIRPORT_SERVICE_LABEL) as AirportServiceType[]).map((s) => (
                <option key={s} value={s}>{AIRPORT_SERVICE_LABEL[s]}</option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as AirportAssistStatus)} className={field}>
              {(Object.keys(AIRPORT_STATUS_LABEL) as AirportAssistStatus[]).map((s) => (
                <option key={s} value={s}>{AIRPORT_STATUS_LABEL[s]}</option>
              ))}
            </select>
            <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="Language" className={field} />
            <input value={greeterName} onChange={(e) => setGreeterName(e.target.value)} placeholder="Greeter name" className={field} />
            <input value={greeterPhone} onChange={(e) => setGreeterPhone(e.target.value)} placeholder="Greeter phone" className={field} />
            <input value={meetingPoint} onChange={(e) => setMeetingPoint(e.target.value)} placeholder="Meeting point" className={field} />
            <input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Pickup driver" className={field} />
            <input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="Pickup driver phone" className={field} />
            <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Pickup vehicle (type · plate)" className={field} />
            <input value={pickupPoint} onChange={(e) => setPickupPoint(e.target.value)} placeholder="Pickup point" className={field} />
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className={`${field} sm:col-span-2`} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={nameBoard} onChange={(e) => setNameBoard(e.target.checked)} /> Name board
            </label>
            <label className="inline-flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} /> VIP reception
            </label>
          </div>
        </>
      )}

      <div className="mt-3 flex items-center justify-end gap-3">
        {error && <span className="text-sm text-destructive">{error}</span>}
        {saved && !error && <span className="text-sm text-green-600">Saved</span>}
        <Button size="sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
