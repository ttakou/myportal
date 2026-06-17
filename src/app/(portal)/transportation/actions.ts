"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { notifyProfiles } from "@/lib/eess-notify";
import { seedTaskChecklist } from "@/lib/task-checklist";
import { getModuleSettings } from "@/lib/module-settings";
import type {
  TransportPriority,
  TransportStatus,
  TransportTaskType,
  VehicleStatus,
} from "@/types/transport";

import type { ActionResult } from "@/types/actions";
export type { ActionResult };

function rev() {
  revalidatePath("/transportation");
}

async function tenantId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  return data?.id ?? null;
}

/**
 * Web-push the task to its assigned driver (if they have a linked portal
 * account with an active push subscription). Best-effort — never blocks the
 * assignment itself.
 */
async function pushTaskToDriver(requestId: string): Promise<void> {
  const supabase = createClient();
  const { data: r } = await supabase
    .from("transport_requests")
    .select(
      "id, tenant_id, pickup, dropoff, depart_at, driver:transport_drivers(profile_id)",
    )
    .eq("id", requestId)
    .maybeSingle();
  const driver = Array.isArray(r?.driver) ? r?.driver[0] : r?.driver;
  if (!r || !driver?.profile_id) return;

  // Tenant operates in Cameroon; render the pickup time in local hours.
  const when = new Date(r.depart_at).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Douala",
  });
  await notifyProfiles({
    tenantId: r.tenant_id,
    profileIds: [driver.profile_id],
    audience: "driver",
    sourceType: "transport_task",
    sourceId: r.id,
    payload: {
      title: "New driving task",
      body: `${r.pickup} → ${r.dropoff} · ${when}`,
      url: "/transportation",
      tag: `transport-${r.id}`,
      severity: "info",
    },
  });
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

  const cfg = await getModuleSettings("transportation");
  if (cfg.allow_employee_requests === false) {
    return { ok: false, error: "Ride requests are disabled — contact the transport desk." };
  }

  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { data, error } = await supabase
    .from("transport_requests")
    .insert({
      tenant_id: tenant,
      pickup: input.pickup.trim(),
      dropoff: input.dropoff.trim(),
      depart_at: new Date(input.departAt).toISOString(),
      passengers: Math.max(1, Math.floor(input.passengers || 1)),
      purpose: input.purpose?.trim() || null,
      task_type: input.taskType ?? "passenger",
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data && cfg.seed_checklists !== false) {
    await seedTaskChecklist(supabase, tenant, data.id, input.taskType ?? "passenger");
  }
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

  const { data, error } = await supabase
    .from("transport_requests")
    .insert({
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
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data) {
    const cfg = await getModuleSettings("transportation");
    if (cfg.seed_checklists !== false) {
      await seedTaskChecklist(supabase, tenant, data.id, input.taskType);
    }
    if (input.driverId && cfg.push_on_assignment !== false) await pushTaskToDriver(data.id);
  }
  rev();
  return { ok: true };
}

export async function cancelTransportRequest(id: string): Promise<ActionResult> {
  return setTransportStatus(id, "cancelled");
}

/**
 * Flag double-booking or off-duty before assigning. Returns a human advisory,
 * or null when the driver is free and on duty. The assignment still proceeds —
 * dispatch keeps the call, this is only a heads-up.
 */
async function driverAssignmentWarning(
  supabase: ReturnType<typeof createClient>,
  driverId: string,
  taskId: string,
  windowHours: number,
): Promise<string | null> {
  const { data: driver } = await supabase
    .from("transport_drivers")
    .select("full_name, on_duty")
    .eq("id", driverId)
    .maybeSingle();
  if (!driver) return null;

  const { data: task } = await supabase
    .from("transport_requests")
    .select("depart_at")
    .eq("id", taskId)
    .maybeSingle();

  const notes: string[] = [];
  if (driver.on_duty === false) notes.push(`${driver.full_name} is marked off duty`);

  if (task?.depart_at && windowHours > 0) {
    // Overlap window: another live task within ±windowHours of this one.
    const t = new Date(task.depart_at).getTime();
    const from = new Date(t - windowHours * 3600_000).toISOString();
    const to = new Date(t + windowHours * 3600_000).toISOString();
    const { data: clashes } = await supabase
      .from("transport_requests")
      .select("id, pickup, dropoff, depart_at")
      .eq("driver_id", driverId)
      .neq("id", taskId)
      .in("status", ["assigned", "in_progress"])
      .gte("depart_at", from)
      .lte("depart_at", to);
    if (clashes && clashes.length > 0) {
      notes.push(
        `${driver.full_name} already has ${clashes.length} task(s) near this time`,
      );
    }
  }
  return notes.length ? notes.join("; ") + "." : null;
}

export async function assignTransport(
  id: string,
  driverId: string | null,
  vehicleId: string | null,
): Promise<ActionResult> {
  if (!isAdminRole(await getCurrentRole())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const cfg = await getModuleSettings("transportation");

  const warning = driverId
    ? await driverAssignmentWarning(
        supabase,
        driverId,
        id,
        Number(cfg.conflict_window_hours ?? 2),
      )
    : null;

  const status = driverId ? "assigned" : "pending";
  const { error } = await supabase
    .from("transport_requests")
    .update({ driver_id: driverId, vehicle_id: vehicleId, status })
    .eq("id", id)
    .in("status", ["pending", "assigned"]);
  if (error) return { ok: false, error: error.message };
  if (driverId && cfg.push_on_assignment !== false) await pushTaskToDriver(id);
  rev();
  return { ok: true, warning: warning ?? undefined };
}

/** A driver toggles their own on/off-duty status. */
export async function setMyDuty(onDuty: boolean): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_driver_duty", { p_on: onDuty });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function addVehicle(input: {
  name: string;
  plate?: string;
  capacity?: number;
}): Promise<ActionResult> {
  if (!isAdminRole(await getCurrentRole())) return { ok: false, error: "Not authorized." };
  if (!input.name.trim()) return { ok: false, error: "Vehicle name is required." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const { error } = await supabase.from("transport_vehicles").insert({
    tenant_id: tenant,
    name: input.name.trim(),
    plate: input.plate?.trim() || null,
    capacity: Math.max(1, Math.floor(input.capacity || 4)),
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function setVehicleStatus(
  id: string,
  status: VehicleStatus,
): Promise<ActionResult> {
  if (!isAdminRole(await getCurrentRole())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { error } = await supabase
    .from("transport_vehicles")
    .update({ status, is_active: status === "active" })
    .eq("id", id);
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

/**
 * Post a message on the task thread (dispatcher, requester, or assigned
 * driver) and push-notify the other side of the conversation: a driver's
 * message reaches the requester + travel desk, anyone else's reaches the
 * driver.
 */
export async function addTaskFollowUp(id: string, note: string): Promise<ActionResult> {
  if (!note.trim()) return { ok: false, error: "Note is empty." };
  const supabase = createClient();
  const { data: req } = await supabase
    .from("transport_requests")
    .select(
      "tenant_id, requester_id, pickup, dropoff, driver:transport_drivers(profile_id, full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!req) return { ok: false, error: "Task not found." };

  const { error } = await supabase.from("transport_task_updates").insert({
    tenant_id: req.tenant_id,
    request_id: id,
    note: note.trim(),
  });
  if (error) return { ok: false, error: error.message };

  await notifyTaskMessage(id, req, note.trim());
  rev();
  return { ok: true };
}

/** Push a task message to the counterparty (best-effort). */
async function notifyTaskMessage(
  requestId: string,
  req: {
    tenant_id: string;
    requester_id: string | null;
    pickup: string;
    dropoff: string;
    driver: unknown;
  },
  note: string,
): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const driver = (Array.isArray(req.driver) ? req.driver[0] : req.driver) as {
    profile_id: string | null;
    full_name: string | null;
  } | null;

  const recipients = new Set<string>();
  if (driver?.profile_id === user.id) {
    // Driver wrote → requester + travel desk hear about it.
    if (req.requester_id) recipients.add(req.requester_id);
    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_active", true)
      .in("role", ["tenant_admin", "super_admin"]);
    for (const a of admins ?? []) recipients.add(a.id as string);
  } else if (driver?.profile_id) {
    // Dispatcher/requester wrote → the driver hears about it.
    recipients.add(driver.profile_id);
  }
  recipients.delete(user.id);
  if (recipients.size === 0) return;

  const { data: me } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  await notifyProfiles({
    tenantId: req.tenant_id,
    profileIds: [...recipients],
    audience: "task_thread",
    sourceType: "transport_task",
    sourceId: requestId,
    payload: {
      title: `Message from ${me?.full_name ?? "the team"}`,
      body: `${req.pickup} → ${req.dropoff}: ${note.slice(0, 120)}`,
      url: "/transportation",
      tag: `task-msg-${requestId}`,
      severity: "info",
    },
  });
}

/** Tick / untick a checklist item (assigned driver or dispatcher; RLS gates). */
export async function toggleChecklistItem(id: string, done: boolean): Promise<ActionResult> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("transport_task_checklist")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Item not found or not yours to update." };
  rev();
  return { ok: true };
}

/** Dispatcher adds a custom checklist item to a task. */
export async function addChecklistItem(
  requestId: string,
  label: string,
): Promise<ActionResult> {
  if (!label.trim()) return { ok: false, error: "Label is empty." };
  if (!isAdminRole(await getCurrentRole())) return { ok: false, error: "Not authorized." };
  const supabase = createClient();
  const { data: req } = await supabase
    .from("transport_requests")
    .select("tenant_id, transport_task_checklist(sort_order)")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Task not found." };
  const maxOrder = Math.max(
    -1,
    ...((req.transport_task_checklist as { sort_order: number }[]) ?? []).map(
      (c) => c.sort_order,
    ),
  );
  const { error } = await supabase.from("transport_task_checklist").insert({
    tenant_id: req.tenant_id,
    request_id: requestId,
    label: label.trim(),
    sort_order: maxOrder + 1,
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
