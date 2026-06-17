import { createClient } from "@/lib/supabase/server";
import type {
  ChecklistItem,
  Driver,
  TaskUpdate,
  TransportRequest,
  Vehicle,
} from "@/types/transport";
import { one } from "@/lib/supabase/row-helpers";

const REQ_SELECT =
  "id, pickup, dropoff, depart_at, passengers, purpose, status, driver_id, vehicle_id," +
  " task_type, priority, notes," +
  " requester:profiles!transport_requests_requester_id_fkey(full_name)," +
  " driver:transport_drivers(full_name, phone), vehicle:transport_vehicles(name)," +
  " transport_task_updates(id, note, new_status, created_at, author:profiles(full_name))," +
  " transport_task_checklist(id, label, sort_order, done, done_at)";

function mapUpdate(row: Record<string, any>): TaskUpdate {
  return {
    id: row.id,
    author_name: one<{ full_name?: string }>(row.author)?.full_name ?? null,
    note: row.note,
    new_status: row.new_status,
    created_at: row.created_at,
  };
}

function mapReq(row: Record<string, any>): TransportRequest {
  const driver = one<{ full_name?: string; phone?: string | null }>(row.driver);
  return {
    id: row.id,
    requester_name: one<{ full_name?: string }>(row.requester)?.full_name ?? null,
    pickup: row.pickup,
    dropoff: row.dropoff,
    depart_at: row.depart_at,
    passengers: row.passengers,
    purpose: row.purpose,
    status: row.status,
    task_type: row.task_type,
    priority: row.priority,
    notes: row.notes,
    driver_id: row.driver_id,
    vehicle_id: row.vehicle_id,
    driver_name: driver?.full_name ?? null,
    driver_phone: driver?.phone ?? null,
    vehicle_name: one<{ name?: string }>(row.vehicle)?.name ?? null,
    updates: ((row.transport_task_updates as any[]) ?? [])
      .map(mapUpdate)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    checklist: (((row.transport_task_checklist as any[]) ?? []) as ChecklistItem[])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order),
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

/** The driver record linked to the signed-in user, if any. */
export async function getMyDriver(): Promise<Driver | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("transport_drivers")
    .select("id, full_name, phone, profile_id, on_duty")
    .eq("profile_id", user.id)
    .maybeSingle();
  return (data as Driver | null) ?? null;
}

/** Tasks assigned to the signed-in driver (RLS scopes the rows). */
export async function getMyDriverTasks(): Promise<TransportRequest[]> {
  const driver = await getMyDriver();
  if (!driver) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("transport_requests")
    .select(REQ_SELECT)
    .eq("driver_id", driver.id)
    .order("depart_at", { ascending: true });
  if (error) {
    console.error("getMyDriverTasks:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapReq(r as Record<string, any>));
}

/** Vehicles available for assignment (active only). */
export async function getVehicles(): Promise<Vehicle[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("transport_vehicles")
    .select("id, name, plate, capacity, status")
    .eq("status", "active")
    .order("name");
  return (data ?? []) as Vehicle[];
}

/** Every vehicle (any status) for the fleet management panel. */
export async function getAllVehicles(): Promise<Vehicle[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("transport_vehicles")
    .select("id, name, plate, capacity, status")
    .order("status")
    .order("name");
  return (data ?? []) as Vehicle[];
}

export async function getDrivers(): Promise<Driver[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("transport_drivers")
    .select("id, full_name, phone, profile_id, on_duty")
    .eq("is_active", true)
    .order("full_name");
  return (data ?? []) as Driver[];
}

/** Tenant profiles, for linking a driver record to a portal account. */
export async function getProfilesForLinking(): Promise<{ id: string; full_name: string }[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .order("full_name");
  return (data ?? []) as { id: string; full_name: string }[];
}
