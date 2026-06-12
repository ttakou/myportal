"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import type {
  TransportPriority,
  TransportStatus,
  TransportTaskType,
} from "@/types/transport";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function rev() {
  revalidatePath("/transportation");
}

async function tenantId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function createTransportRequest(input: {
  pickup: string;
  dropoff: string;
  departAt: string;
  passengers: number;
  purpose?: string;
  taskType?: TransportTaskType;
}): Promise<ActionResult> {
  if (!input.pickup.trim() || !input.dropoff.trim())
    return { ok: false, error: "Pickup and drop-off are required." };
  if (!input.departAt) return { ok: false, error: "Departure time is required." };

  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { error } = await supabase.from("transport_requests").insert({
    tenant_id: tenant,
    pickup: input.pickup.trim(),
    dropoff: input.dropoff.trim(),
    depart_at: new Date(input.departAt).toISOString(),
    passengers: Math.max(1, Math.floor(input.passengers || 1)),
    purpose: input.purpose?.trim() || null,
    task_type: input.taskType ?? "passenger",
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Dispatcher creates a task directly, optionally pre-assigned. */
export async function createTransportTask(input: {
  taskType: TransportTaskType;
  priority: TransportPriority;
  pickup: string;
  dropoff: string;
  departAt: string;
  passengers?: number;
  purpose?: string;
  notes?: string;
  driverId?: string;
  vehicleId?: string;
}): Promise<ActionResult> {
  if (!isAdminRole(await getCurrentRole())) return { ok: false, error: "Not authorized." };
  if (!input.pickup.trim() || !input.dropoff.trim())
    return { ok: false, error: "Pickup and drop-off are required." };
  if (!input.departAt) return { ok: false, error: "Departure time is required." };

  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { error } = await supabase.from("transport_requests").insert({
    tenant_id: tenant,
    pickup: input.pickup.trim(),
    dropoff: input.dropoff.trim(),
    depart_at: new Date(input.departAt).toISOString(),
    passengers: Math.max(1, Math.floor(input.passengers || 1)),
    purpose: input.purpose?.trim() || null,
    notes: input.notes?.trim() || null,
    task_type: input.taskType,
    priority: input.priority,
    driver_id: input.driverId || null,
    vehicle_id: input.vehicleId || null,
    status: input.driverId ? "assigned" : "pending",
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function cancelTransportRequest(id: string): Promise<ActionResult> {
  return setTransportStatus(id, "cancelled");
}

export async function assignTransport(
  id: string,
  driverId: string | null,
  vehicleId: string | null,
): Promise<ActionResult> {
  if (!isAdminRole(await getCurrentRole())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const status = driverId ? "assigned" : "pending";
  const { error } = await supabase
    .from("transport_requests")
    .update({ driver_id: driverId, vehicle_id: vehicleId, status })
    .eq("id", id)
    .in("status", ["pending", "assigned"]);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/**
 * Advance a task's status. RLS decides who may: admins (any task), the
 * assigned driver, or the requester (cancel). The change is logged on the
 * follow-up trail.
 */
export async function setTransportStatus(
  id: string,
  status: TransportStatus,
  note?: string,
): Promise<ActionResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("transport_requests")
    .update({ status })
    .eq("id", id)
    .select("id, tenant_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Task not found or not yours to update." };

  await supabase.from("transport_task_updates").insert({
    tenant_id: data.tenant_id,
    request_id: id,
    note: note?.trim() || null,
    new_status: status,
  });
  rev();
  return { ok: true };
}

/** Add a follow-up note (dispatcher, requester, or assigned driver). */
export async function addTaskFollowUp(id: string, note: string): Promise<ActionResult> {
  if (!note.trim()) return { ok: false, error: "Note is empty." };
  const supabase = createClient();
  const { data: req } = await supabase
    .from("transport_requests")
    .select("tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (!req) return { ok: false, error: "Task not found." };

  const { error } = await supabase.from("transport_task_updates").insert({
    tenant_id: req.tenant_id,
    request_id: id,
    note: note.trim(),
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Dispatcher adds a driver, optionally linked to a portal account. */
export async function addDriver(input: {
  fullName: string;
  phone?: string;
  profileId?: string;
}): Promise<ActionResult> {
  if (!isAdminRole(await getCurrentRole())) return { ok: false, error: "Not authorized." };
  if (!input.fullName.trim()) return { ok: false, error: "Driver name is required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("transport_drivers").insert({
    tenant_id: tenant,
    full_name: input.fullName.trim(),
    phone: input.phone?.trim() || null,
    profile_id: input.profileId || null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Link/unlink a driver record to a portal account so they can self-serve. */
export async function linkDriverProfile(
  driverId: string,
  profileId: string | null,
): Promise<ActionResult> {
  if (!isAdminRole(await getCurrentRole())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase
    .from("transport_drivers")
    .update({ profile_id: profileId })
    .eq("id", driverId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}
