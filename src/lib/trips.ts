import { createClient } from "@/lib/supabase/server";
import type { EmergencyContact, TravelDashboard, Trip } from "@/types/trips";

const SELECT =
  "id, destination, purpose, depart_date, return_date, estimated_cost, status, rejection_reason," +
  " travel_type, transport_mode, route, accommodation, contact_number, dest_emergency_contact," +
  " phase, departed_at, arrived_at, returned_at, last_checkin_at," +
  " requester:profiles!out_of_town_trips_requester_id_fkey(full_name)," +
  " trip_expenses(id, category, amount, note)," +
  " trip_checkins(id, kind, note, created_at)";

function mapTrip(row: Record<string, any>): Trip {
  const requester = Array.isArray(row.requester) ? row.requester[0] : row.requester;
  const expenses = (row.trip_expenses ?? []).map((e: Record<string, any>) => ({
    id: e.id,
    category: e.category,
    amount: Number(e.amount),
    note: e.note,
  }));
  const checkins = (row.trip_checkins ?? [])
    .map((c: Record<string, any>) => ({
      id: c.id,
      kind: c.kind,
      note: c.note,
      created_at: c.created_at,
    }))
    .sort((a: { created_at: string }, b: { created_at: string }) =>
      b.created_at.localeCompare(a.created_at),
    );
  return {
    id: row.id,
    requester_name: requester?.full_name ?? null,
    destination: row.destination,
    purpose: row.purpose,
    depart_date: row.depart_date,
    return_date: row.return_date,
    estimated_cost: Number(row.estimated_cost),
    status: row.status,
    rejection_reason: row.rejection_reason,
    travel_type: row.travel_type,
    transport_mode: row.transport_mode,
    route: row.route,
    accommodation: row.accommodation,
    contact_number: row.contact_number,
    dest_emergency_contact: row.dest_emergency_contact,
    phase: row.phase,
    departed_at: row.departed_at,
    arrived_at: row.arrived_at,
    returned_at: row.returned_at,
    last_checkin_at: row.last_checkin_at,
    checkins,
    expenses,
    expense_total: expenses.reduce((s: number, e: { amount: number }) => s + e.amount, 0),
  };
}

export async function getMyTrips(): Promise<Trip[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("out_of_town_trips")
    .select(SELECT)
    .eq("requester_id", user.id)
    .order("depart_date", { ascending: false });
  if (error) {
    console.error("getMyTrips:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapTrip(r as Record<string, any>));
}

/** Trips awaiting the current user's approval (manager of report, or finance/admin). */
export async function getApprovalQueue(): Promise<Trip[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("out_of_town_trips")
    .select(SELECT)
    .neq("requester_id", user.id)
    .in("status", ["submitted", "manager_approved"])
    .order("depart_date", { ascending: true });
  if (error) {
    console.error("getApprovalQueue:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapTrip(r as Record<string, any>));
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Travel-safety dashboard for managers/admins: who is away, who is moving today,
 * overdue returns, and anyone who has raised a help check-in. RLS scopes the
 * underlying rows (a manager sees their reports; an admin sees the tenant).
 */
export async function getTravelDashboard(): Promise<TravelDashboard> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("out_of_town_trips")
    .select(SELECT)
    .neq("status", "rejected")
    .order("depart_date", { ascending: true });
  if (error) {
    console.error("getTravelDashboard:", error.message);
    return { away: [], departingToday: [], returningToday: [], overdue: [], needsHelp: [] };
  }
  const trips = (data ?? []).map((r) => mapTrip(r as Record<string, any>));
  const today = todayISO();
  const approved = (t: Trip) =>
    ["manager_approved", "finance_approved", "completed"].includes(t.status);

  return {
    away: trips.filter((t) => t.phase === "departed" || t.phase === "arrived"),
    departingToday: trips.filter(
      (t) => approved(t) && t.phase === "declared" && t.depart_date === today,
    ),
    returningToday: trips.filter(
      (t) => t.return_date === today && t.phase !== "returned" && t.phase !== "declared",
    ),
    overdue: trips.filter(
      (t) =>
        t.return_date != null &&
        t.return_date < today &&
        (t.phase === "departed" || t.phase === "arrived"),
    ),
    needsHelp: trips.filter((t) => t.checkins[0]?.kind === "help" && t.phase !== "returned"),
  };
}

/** Destination emergency contacts for the tenant. */
export async function getEmergencyContacts(): Promise<EmergencyContact[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("travel_emergency_contacts")
    .select("id, destination, category, name, phone, note")
    .order("destination", { ascending: true })
    .order("category", { ascending: true });
  if (error) {
    console.error("getEmergencyContacts:", error.message);
    return [];
  }
  return (data ?? []) as EmergencyContact[];
}

/** Whether the signed-in user is the line manager of at least one employee. */
export async function isManager(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("manager_id", user.id);
  return (count ?? 0) > 0;
}
