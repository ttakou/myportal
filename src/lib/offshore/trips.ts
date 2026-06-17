import { createClient } from "@/lib/supabase/server";
import type { OffshoreTrip } from "@/types/offshore";
import { one } from "./_shared";

const SELECT =
  "id, installation_id, mobilize_date, demob_date, status, hse_cleared_at, flight_id, bed_no, person_name," +
  " person:profiles!offshore_trips_profile_id_fkey(full_name)," +
  " installation:offshore_installations(name)," +
  " flight:helicopter_flights(flight_date, route)";

function mapTrip(row: Record<string, any>): OffshoreTrip {
  const flight = one<{ flight_date?: string; route?: string }>(row.flight);
  return {
    id: row.id,
    // Prefer the linked employee's name; fall back to the free-text name.
    person_name:
      one<{ full_name?: string }>(row.person)?.full_name ?? row.person_name ?? null,
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
  // Trips where I'm the traveller, plus trips I raised for named guests.
  const { data } = await supabase
    .from("offshore_trips")
    .select(SELECT)
    .or(`profile_id.eq.${user.id},requester_id.eq.${user.id}`)
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
