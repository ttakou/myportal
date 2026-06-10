import { createClient } from "@/lib/supabase/server";
import type { Driver, TransportRequest, Vehicle } from "@/types/transport";

const REQ_SELECT =
  "id, pickup, dropoff, depart_at, passengers, purpose, status, driver_id, vehicle_id," +
  " requester:profiles!transport_requests_requester_id_fkey(full_name)," +
  " driver:transport_drivers(full_name), vehicle:transport_vehicles(name)";

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function mapReq(row: Record<string, any>): TransportRequest {
  return {
    id: row.id,
    requester_name: one<{ full_name?: string }>(row.requester)?.full_name ?? null,
    pickup: row.pickup,
    dropoff: row.dropoff,
    depart_at: row.depart_at,
    passengers: row.passengers,
    purpose: row.purpose,
    status: row.status,
    driver_id: row.driver_id,
    vehicle_id: row.vehicle_id,
    driver_name: one<{ full_name?: string }>(row.driver)?.full_name ?? null,
    vehicle_name: one<{ name?: string }>(row.vehicle)?.name ?? null,
  };
}

export async function getMyTransportRequests(): Promise<TransportRequest[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("transport_requests")
    .select(REQ_SELECT)
    .eq("requester_id", user.id)
    .order("depart_at", { ascending: false });
  if (error) {
    console.error("getMyTransportRequests:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapReq(r as Record<string, any>));
}

export async function getAllTransportRequests(): Promise<TransportRequest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("transport_requests")
    .select(REQ_SELECT)
    .order("depart_at", { ascending: false });
  if (error) {
    console.error("getAllTransportRequests:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapReq(r as Record<string, any>));
}

export async function getVehicles(): Promise<Vehicle[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("transport_vehicles")
    .select("id, name, plate, capacity")
    .eq("is_active", true)
    .order("name");
  return (data ?? []) as Vehicle[];
}

export async function getDrivers(): Promise<Driver[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("transport_drivers")
    .select("id, full_name, phone")
    .eq("is_active", true)
    .order("full_name");
  return (data ?? []) as Driver[];
}
