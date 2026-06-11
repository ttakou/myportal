"use client";

import { useState, useTransition } from "react";
import { PlaneTakeoff } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { updateAirportAssistance, updateFlight } from "../actions";

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AirportDesk({ trips }: { trips: Trip[] }) {
  const open = trips.filter((t) => t.assistance && t.assistance.status !== "closed");
  const closed = trips.filter((t) => t.assistance && t.assistance.status === "closed");

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <PlaneTakeoff className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Airport assistance desk</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {open.length} open
        </span>
      </div>

      {open.length === 0 && (
        <p className="text-sm text-muted-foreground">No open airport-assistance requests.</p>
      )}

      <div className="space-y-3">
        {open.map((t) => (
          <DeskCard key={t.id} trip={t} />
        ))}
      </div>

      {closed.length > 0 && (
        <details className="rounded-lg border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Closed ({closed.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {closed.map((t) => (
              <li key={t.id}>
                {t.requester_name} · {t.destination}
                {t.flight_number ? ` · ${t.flight_number}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function DeskCard({ trip }: { trip: Trip }) {
  const a = trip.assistance!;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [serviceType, setServiceType] = useState<AirportServiceType>(a.service_type);
  const [status, setStatus] = useState<AirportAssistStatus>(a.status);
  const [greeterName, setGreeterName] = useState(a.greeter_name ?? "");
  const [greeterPhone, setGreeterPhone] = useState(a.greeter_phone ?? "");
  const [driverName, setDriverName] = useState(a.driver_name ?? "");
  const [driverPhone, setDriverPhone] = useState(a.driver_phone ?? "");
  const [vehicle, setVehicle] = useState(a.vehicle ?? "");
  const [pickupPoint, setPickupPoint] = useState(a.pickup_point ?? "");
  const [meetingPoint, setMeetingPoint] = useState(a.meeting_point ?? "");
  const [nameBoard, setNameBoard] = useState(a.name_board);
  const [vip, setVip] = useState(a.vip);
  const [language, setLanguage] = useState(a.language ?? "");
  const [notes, setNotes] = useState(a.notes ?? "");

  const [airline, setAirline] = useState(trip.airline ?? "");
  const [flightNumber, setFlightNumber] = useState(trip.flight_number ?? "");
  const [terminal, setTerminal] = useState(trip.terminal ?? "");
  const [flightArrival, setFlightArrival] = useState(toLocalInput(trip.flight_arrival_at));
  const [flightStatus, setFlightStatus] = useState<FlightStatus>(trip.flight_status);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r1 = await updateAirportAssistance({
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
      if (!r1.ok) {
        setError(r1.error ?? "Could not save.");
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
      setSaved(true);
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
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {AIRPORT_STATUS_LABEL[a.status]}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-muted-foreground">
          Service
          <select value={serviceType} onChange={(e) => setServiceType(e.target.value as AirportServiceType)} className={`mt-1 block w-full ${field}`}>
            {(Object.keys(AIRPORT_SERVICE_LABEL) as AirportServiceType[]).map((s) => (
              <option key={s} value={s}>{AIRPORT_SERVICE_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as AirportAssistStatus)} className={`mt-1 block w-full ${field}`}>
            {(Object.keys(AIRPORT_STATUS_LABEL) as AirportAssistStatus[]).map((s) => (
              <option key={s} value={s}>{AIRPORT_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Flight status
          <select value={flightStatus} onChange={(e) => setFlightStatus(e.target.value as FlightStatus)} className={`mt-1 block w-full ${field}`}>
            {(Object.keys(FLIGHT_STATUS_LABEL) as FlightStatus[]).map((s) => (
              <option key={s} value={s}>{FLIGHT_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>

        <input value={airline} onChange={(e) => setAirline(e.target.value)} placeholder="Airline" className={field} />
        <input value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} placeholder="Flight no." className={field} />
        <input value={terminal} onChange={(e) => setTerminal(e.target.value)} placeholder="Terminal" className={field} />
        <label className="text-xs text-muted-foreground lg:col-span-1">
          Flight arrival
          <input type="datetime-local" value={flightArrival} onChange={(e) => setFlightArrival(e.target.value)} className={`mt-1 block w-full ${field}`} />
        </label>

        <input value={greeterName} onChange={(e) => setGreeterName(e.target.value)} placeholder="Greeter name" className={field} />
        <input value={greeterPhone} onChange={(e) => setGreeterPhone(e.target.value)} placeholder="Greeter phone" className={field} />
        <input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Driver name" className={field} />
        <input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="Driver phone" className={field} />
        <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Vehicle (type · plate)" className={field} />
        <input value={pickupPoint} onChange={(e) => setPickupPoint(e.target.value)} placeholder="Pickup point" className={field} />
        <input value={meetingPoint} onChange={(e) => setMeetingPoint(e.target.value)} placeholder="Meeting point" className={field} />
        <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="Language" className={field} />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className={`${field} sm:col-span-2 lg:col-span-1`} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={nameBoard} onChange={(e) => setNameBoard(e.target.checked)} /> Name board
        </label>
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={vip} onChange={(e) => setVip(e.target.checked)} /> VIP reception
        </label>
        <div className="ml-auto flex items-center gap-3">
          {error && <span className="text-sm text-destructive">{error}</span>}
          {saved && !error && <span className="text-sm text-green-600">Saved</span>}
          <Button size="sm" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
