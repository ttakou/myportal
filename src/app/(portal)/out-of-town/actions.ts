"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lookupFlight } from "@/lib/flight-api";
import { notify, notifyProfiles } from "@/lib/eess-notify";
import {
  APPROVAL_TRAVEL_TYPES,
  TRAVEL_TYPE_LABEL,
  type AirportAssistStatus,
  type AirportServiceType,
  type ContactCategory,
  type FlightStatus,
  type TravelerType,
  type TravelType,
  type TripCheckinKind,
} from "@/types/trips";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function rev() {
  revalidatePath("/out-of-town");
}

const clean = (msg: string) => msg.replace(/^.*?:\s*/, "");

export async function createTrip(input: {
  travelType: TravelType;
  travelerType?: TravelerType;
  destination: string;
  purpose?: string;
  route?: string;
  transportMode?: string;
  accommodation?: string;
  contactNumber?: string;
  destEmergencyContact?: string;
  departDate: string;
  returnDate?: string;
  estimatedCost?: number;
  airline?: string;
  flightNumber?: string;
  terminal?: string;
  flightArrivalAt?: string;
}): Promise<ActionResult> {
  if (!input.destination.trim()) return { ok: false, error: "Destination is required." };
  if (!input.departDate) return { ok: false, error: "Departure date is required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  // Business-type travel awaits supervisor approval; personal/leave/emergency
  // are safety declarations that are recorded as approved immediately.
  const needsApproval = APPROVAL_TRAVEL_TYPES.includes(input.travelType);

  const { data: trip, error } = await supabase
    .from("out_of_town_trips")
    .insert({
      tenant_id: tenant.id,
      travel_type: input.travelType,
      traveler_type: input.travelerType ?? "employee",
      destination: input.destination.trim(),
      purpose: input.purpose?.trim() || null,
      route: input.route?.trim() || null,
      transport_mode: input.transportMode?.trim() || null,
      accommodation: input.accommodation?.trim() || null,
      contact_number: input.contactNumber?.trim() || null,
      dest_emergency_contact: input.destEmergencyContact?.trim() || null,
      depart_date: input.departDate,
      return_date: input.returnDate || null,
      estimated_cost: Math.max(0, input.estimatedCost || 0),
      airline: input.airline?.trim() || null,
      flight_number: input.flightNumber?.trim() || null,
      terminal: input.terminal?.trim() || null,
      flight_arrival_at: input.flightArrivalAt || null,
      status: needsApproval ? "submitted" : "manager_approved",
    })
    .select("id, requester_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  // Ping the supervisor when a business trip is waiting on them.
  if (needsApproval && trip) {
    const { data: me } = await supabase
      .from("profiles")
      .select("manager_id, full_name")
      .eq("id", trip.requester_id)
      .maybeSingle();
    if (me?.manager_id) {
      await notifyProfiles({
        tenantId: tenant.id,
        profileIds: [me.manager_id],
        audience: "manager",
        sourceType: "approval",
        sourceId: trip.id,
        payload: {
          title: "Travel approval needed",
          body: `${me.full_name ?? "An employee"} requested ${TRAVEL_TYPE_LABEL[input.travelType]} travel to ${input.destination.trim()}.`,
          url: "/out-of-town",
          tag: `approval-${trip.id}`,
          severity: "info",
        },
      });
    }
  }
  rev();
  return { ok: true };
}

// --- Meet & greet / airport assistance ---------------------------------------

/** Traveller (or admin) requests an airport reception for a trip. */
export async function requestAirportAssistance(input: {
  tripId: string;
  serviceType?: AirportServiceType;
}): Promise<ActionResult> {
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  // Pull trip details so we can spin up a matching dispatch task.
  const { data: trip } = await supabase
    .from("out_of_town_trips")
    .select("destination, accommodation, terminal, flight_arrival_at, depart_date")
    .eq("id", input.tripId)
    .maybeSingle();

  // Create the airport-pickup task on the transport dispatch board. Best-effort:
  // if the tenant doesn't run the transport module this simply yields no link.
  let transportRequestId: string | null = null;
  if (trip) {
    const { data: task } = await supabase
      .from("transport_requests")
      .insert({
        tenant_id: tenant.id,
        pickup: trip.terminal ? `Airport — Terminal ${trip.terminal}` : "Airport arrivals",
        dropoff: trip.accommodation || trip.destination || "Destination",
        depart_at: trip.flight_arrival_at || `${trip.depart_date}T12:00:00Z`,
        passengers: 1,
        purpose: "Airport meet & greet",
        task_type: "airport_pickup",
        priority: "high",
      })
      .select("id")
      .maybeSingle();
    transportRequestId = task?.id ?? null;
  }

  const { error } = await supabase.from("airport_assistance").insert({
    tenant_id: tenant.id,
    trip_id: input.tripId,
    service_type: input.serviceType ?? "arrival",
    transport_request_id: transportRequestId,
  });
  if (error) return { ok: false, error: clean(error.message) };
  rev();
  return { ok: true };
}

/** Travel desk assigns greeter/driver/vehicle and advances the status. */
export async function updateAirportAssistance(input: {
  id: string;
  serviceType?: AirportServiceType;
  status?: AirportAssistStatus;
  greeterName?: string;
  greeterPhone?: string;
  driverName?: string;
  driverPhone?: string;
  vehicle?: string;
  pickupPoint?: string;
  meetingPoint?: string;
  nameBoard?: boolean;
  vip?: boolean;
  language?: string;
  notes?: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (input.serviceType !== undefined) patch.service_type = input.serviceType;
  if (input.status !== undefined) patch.status = input.status;
  if (input.greeterName !== undefined) patch.greeter_name = input.greeterName.trim() || null;
  if (input.greeterPhone !== undefined) patch.greeter_phone = input.greeterPhone.trim() || null;
  if (input.driverName !== undefined) patch.driver_name = input.driverName.trim() || null;
  if (input.driverPhone !== undefined) patch.driver_phone = input.driverPhone.trim() || null;
  if (input.vehicle !== undefined) patch.vehicle = input.vehicle.trim() || null;
  if (input.pickupPoint !== undefined) patch.pickup_point = input.pickupPoint.trim() || null;
  if (input.meetingPoint !== undefined) patch.meeting_point = input.meetingPoint.trim() || null;
  if (input.nameBoard !== undefined) patch.name_board = input.nameBoard;
  if (input.vip !== undefined) patch.vip = input.vip;
  if (input.language !== undefined) patch.language = input.language.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes.trim() || null;

  const { error } = await supabase.from("airport_assistance").update(patch).eq("id", input.id);
  if (error) return { ok: false, error: clean(error.message) };
  rev();
  return { ok: true };
}

/**
 * Pull live status for the trip's flight number from the flight-data API and
 * write it back (status, arrival estimate, terminal, airline if missing).
 */
export async function refreshFlightStatus(tripId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data: trip, error: readError } = await supabase
    .from("out_of_town_trips")
    .select("id, flight_number, airline, terminal")
    .eq("id", tripId)
    .maybeSingle();
  if (readError) return { ok: false, error: clean(readError.message) };
  if (!trip) return { ok: false, error: "Trip not found." };
  if (!trip.flight_number) {
    return { ok: false, error: "Add a flight number first, then refresh." };
  }

  const result = await lookupFlight(trip.flight_number);
  if (!result.ok) return { ok: false, error: result.error };

  const info = result.info;
  const patch: Record<string, unknown> = {
    flight_status: info.status,
    flight_checked_at: new Date().toISOString(),
  };
  if (info.arrivalAt) patch.flight_arrival_at = info.arrivalAt;
  // Fill in airline/terminal from the API only when the desk left them blank.
  if (info.airline && !trip.airline) patch.airline = info.airline;
  if (info.terminal && !trip.terminal) patch.terminal = info.terminal;

  const { error } = await supabase.from("out_of_town_trips").update(patch).eq("id", tripId);
  if (error) return { ok: false, error: clean(error.message) };
  rev();
  return { ok: true };
}

/** Travel desk updates accommodation and the assigned driver/car on a trip. */
export async function updateTripLogistics(input: {
  tripId: string;
  accommodation?: string;
  driverName?: string;
  driverPhone?: string;
  vehicle?: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (input.accommodation !== undefined) patch.accommodation = input.accommodation.trim() || null;
  if (input.driverName !== undefined) patch.assigned_driver_name = input.driverName.trim() || null;
  if (input.driverPhone !== undefined) patch.assigned_driver_phone = input.driverPhone.trim() || null;
  if (input.vehicle !== undefined) patch.assigned_vehicle = input.vehicle.trim() || null;

  const { error } = await supabase.from("out_of_town_trips").update(patch).eq("id", input.tripId);
  if (error) return { ok: false, error: clean(error.message) };
  rev();
  return { ok: true };
}

/** Travel desk updates flight details / status on the trip. */
export async function updateFlight(input: {
  tripId: string;
  airline?: string;
  flightNumber?: string;
  terminal?: string;
  flightArrivalAt?: string;
  flightStatus?: FlightStatus;
}): Promise<ActionResult> {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (input.airline !== undefined) patch.airline = input.airline.trim() || null;
  if (input.flightNumber !== undefined) patch.flight_number = input.flightNumber.trim() || null;
  if (input.terminal !== undefined) patch.terminal = input.terminal.trim() || null;
  if (input.flightArrivalAt !== undefined) patch.flight_arrival_at = input.flightArrivalAt || null;
  if (input.flightStatus !== undefined) patch.flight_status = input.flightStatus;

  const { error } = await supabase.from("out_of_town_trips").update(patch).eq("id", input.tripId);
  if (error) return { ok: false, error: clean(error.message) };
  rev();
  return { ok: true };
}

export async function managerApproveTrip(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("out_of_town_trips")
    .update({
      status: "manager_approved",
      manager_approved_by: user?.id ?? null,
      manager_approved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: clean(error.message) };
  rev();
  return { ok: true };
}

export async function rejectTrip(id: string, reason: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("out_of_town_trips")
    .update({ status: "rejected", rejection_reason: reason.trim() || null })
    .eq("id", id);
  if (error) return { ok: false, error: clean(error.message) };
  rev();
  return { ok: true };
}

// --- Safety check-ins --------------------------------------------------------

export async function tripCheckin(input: {
  tripId: string;
  kind: TripCheckinKind;
  note?: string;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Look up the trip for tenant + destination (RLS keeps this to trips you own).
  const { data: trip } = await supabase
    .from("out_of_town_trips")
    .select("id, tenant_id, destination, travel_type")
    .eq("id", input.tripId)
    .maybeSingle();
  if (!trip) return { ok: false, error: "Trip not found." };

  const now = new Date().toISOString();

  // Log the check-in.
  const { error: logErr } = await supabase.from("trip_checkins").insert({
    tenant_id: trip.tenant_id,
    trip_id: trip.id,
    kind: input.kind,
    note: input.note?.trim() || null,
  });
  if (logErr) return { ok: false, error: clean(logErr.message) };

  // Advance the trip phase / stamp the safety timestamps.
  const patch: Record<string, unknown> = { last_checkin_at: now };
  if (input.kind === "departed") {
    patch.phase = "departed";
    patch.departed_at = now;
  } else if (input.kind === "arrived") {
    patch.phase = "arrived";
    patch.arrived_at = now;
  } else if (input.kind === "returned") {
    patch.phase = "returned";
    patch.returned_at = now;
  }
  const { error: updErr } = await supabase
    .from("out_of_town_trips")
    .update(patch)
    .eq("id", trip.id);
  if (updErr) return { ok: false, error: clean(updErr.message) };

  // "I need help" raises an EESS incident so it reaches the response team.
  if (input.kind === "help") {
    const { data: incident } = await supabase
      .from("eess_incidents")
      .insert({
        reporter_id: user.id,
        incident_type: "other",
        is_sos: true,
        note:
          `Travel SOS — ${TRAVEL_TYPE_LABEL[trip.travel_type as TravelType]} to ${trip.destination}` +
          (input.note?.trim() ? ` · ${input.note.trim()}` : ""),
        location_text: trip.destination,
      })
      .select("id, tenant_id")
      .single();
    if (incident?.tenant_id) {
      await notify({
        tenantId: incident.tenant_id,
        audience: "responders",
        sourceType: "incident",
        sourceId: incident.id,
        payload: {
          title: `🚨 Travel SOS — ${trip.destination}`,
          body: input.note?.trim() || "A traveller has requested assistance.",
          url: "/emergency/command",
          tag: `trip-help-${trip.id}`,
          severity: "critical",
        },
      });
    }
  }

  rev();
  revalidatePath("/emergency/command");
  return { ok: true };
}

// --- Destination emergency contacts (admins) ---------------------------------

export async function addEmergencyContact(input: {
  destination: string;
  category: ContactCategory;
  name: string;
  phone?: string;
  note?: string;
}): Promise<ActionResult> {
  if (!input.destination.trim() || !input.name.trim()) {
    return { ok: false, error: "Destination and name are required." };
  }
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("travel_emergency_contacts").insert({
    tenant_id: tenant.id,
    destination: input.destination.trim(),
    category: input.category,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: clean(error.message) };
  rev();
  return { ok: true };
}

export async function deleteEmergencyContact(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from("travel_emergency_contacts").delete().eq("id", id);
  if (error) return { ok: false, error: clean(error.message) };
  rev();
  return { ok: true };
}

// --- Legacy expense reconciliation (kept) ------------------------------------

export async function addTripExpense(input: {
  tripId: string;
  category: string;
  amount: number;
  note?: string;
}): Promise<ActionResult> {
  if (!input.category.trim()) return { ok: false, error: "Category is required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("trip_expenses").insert({
    tenant_id: tenant.id,
    trip_id: input.tripId,
    category: input.category.trim(),
    amount: Math.max(0, input.amount || 0),
    note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: clean(error.message) };
  rev();
  return { ok: true };
}
