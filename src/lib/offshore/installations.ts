import { createClient } from "@/lib/supabase/server";
import type { Flight, Installation, Pob } from "@/types/offshore";

export async function getInstallations(): Promise<Installation[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_installations")
    .select("id, name, pob_capacity")
    .eq("is_active", true)
    .order("name");
  return (data ?? []) as Installation[];
}

/** Every installation (incl. retired) for the configuration panel. */
export async function getAllInstallations(): Promise<Installation[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("offshore_installations")
    .select("id, name, pob_capacity, is_active")
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
