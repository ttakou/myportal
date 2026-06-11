"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/eess-notify";
import {
  APPROVAL_TRAVEL_TYPES,
  TRAVEL_TYPE_LABEL,
  type ContactCategory,
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
}): Promise<ActionResult> {
  if (!input.destination.trim()) return { ok: false, error: "Destination is required." };
  if (!input.departDate) return { ok: false, error: "Departure date is required." };
  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  // Business-type travel awaits supervisor approval; personal/leave/emergency
  // are safety declarations that are recorded as approved immediately.
  const needsApproval = APPROVAL_TRAVEL_TYPES.includes(input.travelType);

  const { error } = await supabase.from("out_of_town_trips").insert({
    tenant_id: tenant.id,
    travel_type: input.travelType,
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
    status: needsApproval ? "submitted" : "manager_approved",
  });
  if (error) return { ok: false, error: error.message };
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
