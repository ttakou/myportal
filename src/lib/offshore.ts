import { createClient } from "@/lib/supabase/server";
import type { Flight, Installation, OffshoreTrip, Pob } from "@/types/offshore";

const SELECT =
  "id, installation_id, mobilize_date, demob_date, status, hse_cleared_at, flight_id, bed_no," +
  " person:profiles!offshore_trips_profile_id_fkey(full_name)," +
  " installation:offshore_installations(name)," +
  " flight:helicopter_flights(flight_date, route)";

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function mapTrip(row: Record<string, any>): OffshoreTrip {
  const flight = one<{ flight_date?: string; route?: string }>(row.flight);
  return {
    id: row.id,
    person_name: one<{ full_name?: string }>(row.person)?.full_name ?? null,
    installation_id: row.installation_id,
    installation_name: one<{ name?: string }>(row.installation)?.name ?? null,
    mobilize_date: row.mobilize_date,
    demob_date: row.demob_date,
    status: row.status,
    hse_cleared_at: row.hse_cleared_at,
    flight_id: row.flight_id,
    flight_label: flight ? `${flight.route} · ${flight.flight_date}` : null,
    bed_no: row.bed_no,
  };
}

export async function getMyOffshoreTrips(): Promise<OffshoreTrip[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("offshore_trips")
    .select(SELECT)
    .eq("profile_id", user.id)
    .order("mobilize_date", { ascending: false });
  return (data ?? []).map((r) => mapTrip(r as Record<string, any>));
}

export async function getAllOffshoreTrips(): Promise<OffshoreTrip[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_trips")
    .select(SELECT)
    .order("mobilize_date", { ascending: false });
  return (data ?? []).map((r) => mapTrip(r as Record<string, any>));
}

export async function getInstallations(): Promise<Installation[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_installations")
    .select("id, name, pob_capacity")
    .eq("is_active", true)
    .order("name");
  return (data ?? []) as Installation[];
}

export async function getFlights(): Promise<Flight[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("helicopter_flights")
    .select("id, flight_date, route, seats")
    .order("flight_date", { ascending: false });
  return (data ?? []) as Flight[];
}

export async function getPob(): Promise<Pob[]> {
  const supabase = createClient();
  const { data } = await supabase.from("offshore_pob").select("*").order("name");
  return (data ?? []) as Pob[];
}
