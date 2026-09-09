"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/permissions-server";
import { notifyProfiles } from "@/lib/eess-notify";
import { notifyUsers } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import { seedTaskChecklist } from "@/lib/task-checklist";
import { getModuleSettings } from "@/lib/module-settings";
import { shuttleDepartAt, shuttleRunsOn } from "@/lib/transport/shuttles";
import { canonicalPlace, normalisePlaceName } from "@/lib/transport/places";
import { localInputToIso } from "@/lib/transport/day-plan";
import { describeTripLog, validateTripLog, type TripLogInput } from "@/lib/transport/trip-log";
import { deskIdsFor } from "@/lib/transport-desk";
import { runTransportShuttles } from "@/lib/transport-shuttle-run";
import { getActiveDelegatorIds } from "@/lib/delegation";
import { getPlaces } from "@/lib/transport";
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
  /** Book the return leg too: back from the drop-off at this time. */
  returnAt?: string;
}): Promise<ActionResult> {
  if (!input.pickup.trim() || !input.dropoff.trim())
    return { ok: false, error: "Pickup and drop-off are required." };
  const departIso = input.departAt ? localInputToIso(input.departAt) : null;
  if (!departIso) return { ok: false, error: "Departure time is required." };
  const returnIso = input.returnAt ? localInputToIso(input.returnAt) : null;
  if (input.returnAt && !returnIso) return { ok: false, error: "The return time is not a valid date and time." };
  if (returnIso && Date.parse(returnIso) <= Date.parse(departIso))
    return { ok: false, error: "The return must leave after the outbound trip." };

  const cfg = await getModuleSettings("transportation");
  if (cfg.allow_employee_requests === false) {
    return { ok: false, error: "Ride requests are disabled — contact the transport desk." };
  }

  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // With approval on, a request waits on the requester's line manager; a
  // requester with no manager on file goes straight to dispatch.
  let managerId: string | null = null;
  if (cfg.require_approval === true && user) {
    const { data: me } = await supabase.from("profiles").select("manager_id, full_name").eq("id", user.id).maybeSingle();
    managerId = (me?.manager_id as string | null) ?? null;
  }
  const status = managerId ? "awaiting_approval" : "pending";
  const places = await getPlaces();
  const pickup = canonicalPlace(input.pickup, places);
  const dropoff = canonicalPlace(input.dropoff, places);
  const taskType = input.taskType ?? "passenger";
  const passengers = Math.max(1, Math.floor(input.passengers || 1));
  const purpose = input.purpose?.trim() || null;

  const { data, error } = await supabase
    .from("transport_requests")
    .insert({
      tenant_id: tenant,
      pickup,
      dropoff,
      depart_at: departIso,
      passengers,
      purpose,
      task_type: taskType,
      status,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data && cfg.seed_checklists !== false) {
    await seedTaskChecklist(supabase, tenant, data.id, taskType);
  }

  // The return leg is its own request — its own driver, its own status —
  // that points back at the outbound one so the two are decided together.
  if (data && input.returnAt) {
    const { data: ret, error: retError } = await supabase
      .from("transport_requests")
      .insert({
        tenant_id: tenant,
        pickup: dropoff,
        dropoff: pickup,
        depart_at: returnIso as string,
        passengers,
        purpose,
        task_type: taskType,
        status,
        return_of: data.id,
      })
      .select("id")
      .maybeSingle();
    if (retError) return { ok: false, error: `Outbound saved, but the return failed: ${retError.message}` };
    if (ret && cfg.seed_checklists !== false) {
      await seedTaskChecklist(supabase, tenant, ret.id, taskType);
    }
  }

  if (data) {
    const route = `${pickup} → ${dropoff}`;
    const when = `${fmtLocal(departIso)}${returnIso ? `, back ${fmtLocal(returnIso)}` : ""}`;
    if (managerId) {
      // The manager, and whoever holds their access while they are away.
      const adminCli = createAdminClient();
      const { data: delegates } = adminCli
        ? await adminCli
            .from("access_delegations")
            .select("delegate_id")
            .eq("delegator_id", managerId)
            .is("revoked_at", null)
            .lte("starts_on", new Date().toISOString().slice(0, 10))
            .gte("ends_on", new Date().toISOString().slice(0, 10))
        : { data: [] };
      await notifyUsers({
        tenantId: tenant,
        profileIds: [managerId, ...(delegates ?? []).map((d) => d.delegate_id as string)],
        category: "approval",
        title: "Ride request to approve",
        body: `${route} · ${when}. Approve or reject on the Transportation approvals view.`,
        url: "/transportation?view=approvals",
      });
    } else {
      await notifyUsers({
        tenantId: tenant,
        profileIds: await dispatchDeskIds(),
        category: "transport",
        title: "New transport request",
        body: `${route} · ${when}. Assign a driver on the dispatch board.`,
        url: "/transportation?view=dispatch",
      });
    }
  }
  rev();
  return { ok: true };
}

/**
 * The dispatch desk: whoever holds the transportation approve / manage
 * verb, else every tenant admin. Looked up with the service role — a
 * requester cannot read other people's role assignments.
 */
async function dispatchDeskIds(): Promise<string[]> {
  const tenant = await tenantId();
  if (!tenant) return [];
  return deskIdsFor(createAdminClient() ?? createClient(), tenant);
}

/** A pickup time on the tenant's clock, for a notification body. */
function fmtLocal(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Douala",
  });
}

/**
 * A line manager (or an admin) decides a request waiting on approval.
 * Approve sends it to the dispatch desk; reject cancels it with the reason
 * on the follow-up trail. Either way the requester is told.
 */
export async function decideTransportRequest(
  id: string,
  decision: "approve" | "reject",
  reason?: string,
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: req } = await supabase
    .from("transport_requests")
    .select("id, tenant_id, status, requester_id, return_of, pickup, dropoff, depart_at, requester:profiles!transport_requests_requester_id_fkey(manager_id)")
    .eq("id", id)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "awaiting_approval") return { ok: false, error: "This request is not waiting for approval." };
  const requester = (Array.isArray(req.requester) ? req.requester[0] : req.requester) as { manager_id?: string | null } | null;
  const managerId = requester?.manager_id ?? null;
  // The line manager, or whoever holds their access for the delegation window.
  const isManager = Boolean(managerId) && (managerId === user.id || (await getActiveDelegatorIds()).includes(managerId as string));
  const admin = isAdminRole(await getCurrentRole());
  if (!isManager && !admin) return { ok: false, error: "Only the requester's line manager can decide this." };

  // A return trip is two requests decided as one.
  let siblingId: string | null = (req.return_of as string | null) ?? null;
  if (!siblingId) {
    const { data: ret } = await supabase.from("transport_requests").select("id").eq("return_of", id).maybeSingle();
    siblingId = ret?.id ?? null;
  }
  const ids = siblingId ? [id, siblingId] : [id];

  const next = decision === "approve" ? "pending" : "cancelled";
  const { error } = await supabase
    .from("transport_requests")
    .update(
      decision === "approve"
        ? { status: next, approved_by: user.id, approved_at: new Date().toISOString() }
        : { status: next },
    )
    .in("id", ids)
    .eq("status", "awaiting_approval");
  if (error) return { ok: false, error: error.message };

  // The trail entry is written with the service role: the manager may decide
  // the request but is not one of the people RLS lets post on its thread.
  const adminCli = createAdminClient();
  if (adminCli) {
    const who = managerId === user.id ? "line manager" : admin && !isManager ? "administrator" : "line manager's delegate";
    const note = decision === "approve" ? `Approved by ${who}.` : `Rejected by ${who}${reason?.trim() ? `: ${reason.trim()}` : "."}`;
    await adminCli.from("transport_task_updates").insert(
      ids.map((requestId) => ({ tenant_id: req.tenant_id, request_id: requestId, author_id: user.id, note, new_status: next })),
    );
  }

  const route = `${req.pickup} → ${req.dropoff}${siblingId ? " (and return)" : ""}`;
  await notifyUsers({
    tenantId: req.tenant_id,
    profileIds: [req.requester_id as string | null],
    category: "transport",
    title: decision === "approve" ? "Ride request approved" : "Ride request rejected",
    body:
      decision === "approve"
        ? `${route} · ${fmtLocal(req.depart_at as string)}. The dispatch desk will assign a driver.`
        : `${route} · ${fmtLocal(req.depart_at as string)}.${reason?.trim() ? ` Reason: ${reason.trim()}` : ""}`,
    url: "/transportation?view=requests",
  });
  if (decision === "approve") {
    await notifyUsers({
      tenantId: req.tenant_id,
      profileIds: await dispatchDeskIds(),
      category: "transport",
      title: "Approved transport request",
      body: `${route} · ${fmtLocal(req.depart_at as string)}. Assign a driver on the dispatch board.`,
      url: "/transportation?view=dispatch",
    });
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
  const gate = await requireModule("transportation", "manage");
  if (gate) return gate;
  if (!input.pickup.trim() || !input.dropoff.trim())
    return { ok: false, error: "Pickup and drop-off are required." };
  const departIso = input.departAt ? localInputToIso(input.departAt) : null;
  if (!departIso) return { ok: false, error: "Departure time is required." };

  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const places = await getPlaces();

  const { data, error } = await supabase
    .from("transport_requests")
    .insert({
      tenant_id: tenant,
      pickup: canonicalPlace(input.pickup, places),
      dropoff: canonicalPlace(input.dropoff, places),
      depart_at: departIso,
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
  const gate = await requireModule("transportation", "approve");
  if (gate) return gate;
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
  const { data: updated, error } = await supabase
    .from("transport_requests")
    .update({ driver_id: driverId, vehicle_id: vehicleId, status })
    .eq("id", id)
    .in("status", ["pending", "assigned"])
    .select("tenant_id, requester_id, pickup, dropoff, depart_at, driver:transport_drivers(full_name, phone), vehicle:transport_vehicles(name)")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (driverId && cfg.push_on_assignment !== false) await pushTaskToDriver(id);
  if (driverId && updated?.requester_id) {
    const d = (Array.isArray(updated.driver) ? updated.driver[0] : updated.driver) as { full_name?: string; phone?: string | null } | null;
    const v = (Array.isArray(updated.vehicle) ? updated.vehicle[0] : updated.vehicle) as { name?: string } | null;
    await notifyUsers({
      tenantId: updated.tenant_id as string,
      profileIds: [updated.requester_id as string],
      category: "transport",
      title: `Driver assigned: ${d?.full_name ?? "a driver"}`,
      body: `${updated.pickup} → ${updated.dropoff} · ${fmtLocal(updated.depart_at as string)}${d?.phone ? ` · ${d.phone}` : ""}${v?.name ? ` · ${v.name}` : ""}`,
      url: "/transportation?view=requests",
    });
  }
  rev();
  return { ok: true, warning: warning ?? undefined };
}

/** The desk sets a driver on or off duty (a driver can also do it themselves). */
export async function setDriverDuty(driverId: string, onDuty: boolean): Promise<ActionResult> {
  const gate = await requireModule("transportation", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("transport_drivers").update({ on_duty: onDuty }).eq("id", driverId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/** Retire a driver from the assign lists, or bring them back. */
export async function setDriverActive(driverId: string, active: boolean): Promise<ActionResult> {
  const gate = await requireModule("transportation", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("transport_drivers").update({ is_active: active }).eq("id", driverId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
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
  const gate = await requireModule("transportation", "manage");
  if (gate) return gate;
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
  const gate = await requireModule("transportation", "manage");
  if (gate) return gate;
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const stamp =
    status === "in_progress"
      ? { started_at: now }
      : status === "arrived"
        ? { arrived_at: now }
        : status === "completed" || status === "no_show"
          ? { completed_at: now }
          : {};
  const { data, error } = await supabase
    .from("transport_requests")
    .update({ status, ...stamp })
    .eq("id", id)
    .select("id, tenant_id, requester_id, pickup, dropoff, depart_at, driver:transport_drivers(full_name, phone)")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Task not found or not yours to update." };

  await supabase.from("transport_task_updates").insert({
    tenant_id: data.tenant_id,
    request_id: id,
    note: note?.trim() || null,
    new_status: status,
  });

  // The requester hears about the moments that matter to them, unless they
  // caused the change themselves.
  const requesterId = data.requester_id as string | null;
  if (requesterId && requesterId !== user?.id) {
    const d = (Array.isArray(data.driver) ? data.driver[0] : data.driver) as { full_name?: string; phone?: string | null } | null;
    const route = `${data.pickup} → ${data.dropoff}`;
    const text =
      status === "in_progress"
        ? { title: "Your driver is on the way", body: `${d?.full_name ?? "Your driver"}${d?.phone ? ` (${d.phone})` : ""} has started ${route}.` }
        : status === "arrived"
          ? { title: `Your driver is at ${data.pickup}`, body: `${d?.full_name ?? "Your driver"}${d?.phone ? ` (${d.phone})` : ""} is waiting for you.` }
          : status === "completed"
            ? { title: "Trip completed", body: `${route} · ${fmtLocal(data.depart_at as string)}. How was the ride? Rate it on your requests list.` }
            : status === "no_show"
              ? { title: "Marked as no-show", body: `${d?.full_name ?? "The driver"} waited at ${data.pickup} for ${route} · ${fmtLocal(data.depart_at as string)}${note?.trim() ? ` · ${note.trim()}` : ""}.` }
              : status === "cancelled"
                ? { title: "Ride request cancelled", body: `${route} · ${fmtLocal(data.depart_at as string)}${note?.trim() ? ` · ${note.trim()}` : ""}.` }
                : null;
    if (text) {
      await notifyUsers({
        tenantId: data.tenant_id as string,
        profileIds: [requesterId],
        category: "transport",
        ...text,
        url: "/transportation?view=requests",
      });
    }
  }
  // A no-show is the desk's business too: the slot was wasted.
  if (status === "no_show") {
    await notifyUsers({
      tenantId: data.tenant_id as string,
      profileIds: await dispatchDeskIds(),
      category: "transport",
      title: `No-show: ${data.pickup} → ${data.dropoff}`,
      body: `${fmtLocal(data.depart_at as string)}${note?.trim() ? ` · ${note.trim()}` : ""}.`,
      url: "/transportation?view=dispatch",
    });
  }
  rev();
  return { ok: true };
}

/** The driver sets off, noting the odometer if they have it. */
export async function startTrip(id: string, odometerStart?: number | string | null): Promise<ActionResult> {
  const v = validateTripLog({ odometerStart });
  if (!v.ok) return { ok: false, error: v.error };
  if (v.log.odometer_start !== null) {
    const { error } = await createClient().from("transport_requests").update({ odometer_start: v.log.odometer_start }).eq("id", id);
    if (error) return { ok: false, error: error.message };
  }
  return setTransportStatus(id, "in_progress");
}

/** The driver closes the trip with its log: odometer, fuel, a note. */
export async function completeTrip(id: string, log: TripLogInput, note?: string): Promise<ActionResult> {
  const v = validateTripLog(log);
  if (!v.ok) return { ok: false, error: v.error };
  const patch: Record<string, number> = {};
  if (v.log.odometer_start !== null) patch.odometer_start = v.log.odometer_start;
  if (v.log.odometer_end !== null) patch.odometer_end = v.log.odometer_end;
  if (v.log.fuel_litres !== null) patch.fuel_litres = v.log.fuel_litres;
  if (v.log.fuel_cost !== null) patch.fuel_cost = v.log.fuel_cost;
  if (Object.keys(patch).length > 0) {
    const { error } = await createClient().from("transport_requests").update(patch).eq("id", id);
    if (error) return { ok: false, error: error.message };
  }
  const summary = describeTripLog(v.log);
  const trail = [summary, note?.trim()].filter(Boolean).join(" · ");
  return setTransportStatus(id, "completed", trail || undefined);
}

/** The passenger did not turn up. */
export async function markNoShow(id: string, note?: string): Promise<ActionResult> {
  return setTransportStatus(id, "no_show", note);
}

/**
 * The requester changes their own request while nobody is working on it
 * (still awaiting approval or pending). The desk, or the manager, hears
 * that it changed.
 */
export async function updateTransportRequest(
  id: string,
  input: { pickup: string; dropoff: string; departAt: string; passengers: number; purpose?: string },
): Promise<ActionResult> {
  if (!input.pickup.trim() || !input.dropoff.trim()) return { ok: false, error: "Pickup and drop-off are required." };
  const departIso = input.departAt ? localInputToIso(input.departAt) : null;
  if (!departIso) return { ok: false, error: "Departure time is required." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: req } = await supabase
    .from("transport_requests")
    .select("id, tenant_id, status, requester_id, pickup, dropoff, depart_at")
    .eq("id", id)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  const admin = isAdminRole(await getCurrentRole());
  if (req.requester_id !== user.id && !admin) return { ok: false, error: "Only the requester can change this request." };
  if (req.status !== "awaiting_approval" && req.status !== "pending")
    return { ok: false, error: "A driver is already on this request; cancel it and ask again, or message the desk on its thread." };

  const places = await getPlaces();
  const pickup = canonicalPlace(input.pickup, places);
  const dropoff = canonicalPlace(input.dropoff, places);
  const { error } = await supabase
    .from("transport_requests")
    .update({
      pickup,
      dropoff,
      depart_at: departIso,
      passengers: Math.max(1, Math.floor(input.passengers || 1)),
      purpose: input.purpose?.trim() || null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const changed: string[] = [];
  if (pickup !== req.pickup || dropoff !== req.dropoff) changed.push(`${pickup} → ${dropoff}`);
  if (departIso !== req.depart_at) changed.push(fmtLocal(departIso));
  const note = `Request changed${changed.length ? `: ${changed.join(", ")}` : ""}.`;
  await supabase.from("transport_task_updates").insert({ tenant_id: req.tenant_id, request_id: id, note, new_status: null });
  if (req.status === "pending") {
    await notifyUsers({
      tenantId: req.tenant_id as string,
      profileIds: await dispatchDeskIds(),
      category: "transport",
      title: "Transport request changed",
      body: `${pickup} → ${dropoff} · ${fmtLocal(departIso)}.`,
      url: "/transportation?view=dispatch",
    });
  }
  rev();
  return { ok: true };
}

/** The requester rates a completed ride, 1–5, with a word if they like. */
export async function rateTrip(id: string, rating: number, comment?: string): Promise<ActionResult> {
  const r = Math.round(Number(rating));
  if (!(r >= 1 && r <= 5)) return { ok: false, error: "Pick one to five stars." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: req } = await supabase.from("transport_requests").select("id, status, requester_id").eq("id", id).maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  if (req.requester_id !== user.id) return { ok: false, error: "Only the person who rode can rate the ride." };
  if (req.status !== "completed") return { ok: false, error: "Rate the ride once it is completed." };
  const { error } = await supabase
    .from("transport_requests")
    .update({ rating: r, rating_comment: comment?.trim() || null, rated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
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
  const gate = await requireModule("transportation", "manage");
  if (gate) return gate;
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
  const gate = await requireModule("transportation", "manage");
  if (gate) return gate;
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
  const gate = await requireModule("transportation", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase
    .from("transport_drivers")
    .update({ profile_id: profileId })
    .eq("id", driverId);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}


// ---- Recurring shuttles ------------------------------------------------------

export async function createShuttle(input: {
  name: string;
  pickup: string;
  dropoff: string;
  departTime: string;
  daysOfWeek: number[];
  passengers?: number;
  taskType?: TransportTaskType;
  driverId?: string | null;
  vehicleId?: string | null;
}): Promise<ActionResult> {
  const gate = await requireModule("transportation", "manage");
  if (gate) return gate;
  if (!input.name.trim() || !input.pickup.trim() || !input.dropoff.trim())
    return { ok: false, error: "Name, pickup and drop-off are required." };
  if (!/^\d{2}:\d{2}$/.test(input.departTime)) return { ok: false, error: "Departure time must be HH:MM." };
  const days = [...new Set(input.daysOfWeek.filter((d) => d >= 0 && d <= 6))].sort();
  if (days.length === 0) return { ok: false, error: "Pick at least one day." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const places = await getPlaces();
  const { error } = await supabase.from("transport_shuttles").insert({
    tenant_id: tenant,
    name: input.name.trim(),
    pickup: canonicalPlace(input.pickup, places),
    dropoff: canonicalPlace(input.dropoff, places),
    depart_time: input.departTime,
    days_of_week: days,
    passengers: Math.max(1, Math.floor(input.passengers || 1)),
    task_type: input.taskType ?? "passenger",
    driver_id: input.driverId || null,
    vehicle_id: input.vehicleId || null,
    created_by: user?.id ?? null,
  });
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function updateShuttle(
  id: string,
  patch: { isActive?: boolean; driverId?: string | null; vehicleId?: string | null },
): Promise<ActionResult> {
  const gate = await requireModule("transportation", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const row: Record<string, unknown> = {};
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.driverId !== undefined) row.driver_id = patch.driverId || null;
  if (patch.vehicleId !== undefined) row.vehicle_id = patch.vehicleId || null;
  const { error } = await supabase.from("transport_shuttles").update(row).eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

export async function deleteShuttle(id: string): Promise<ActionResult> {
  const gate = await requireModule("transportation", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("transport_shuttles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

/**
 * Create today's (or a given day's) shuttle tasks now, without waiting for
 * the nightly job — after adding a shuttle mid-morning, say. Idempotent:
 * a run that already has its task is skipped.
 */
export async function runShuttlesNow(dateIso: string): Promise<ActionResult & { created?: number }> {
  const gate = await requireModule("transportation", "manage");
  if (gate) return gate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return { ok: false, error: "Pick a date." };
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const res = await runTransportShuttles(dateIso, tenant);
  if (!res.ok) return { ok: false, error: res.error ?? "Could not create the runs." };
  rev();
  return { ok: true, created: res.created };
}

// --- Saved places -----------------------------------------------------------

/** Name a pickup or drop-off point once; forms offer it and requests fold onto its spelling. */
export async function addPlace(name: string): Promise<ActionResult> {
  const gate = await requireModule("transportation", "manage");
  if (gate) return gate;
  const clean = normalisePlaceName(name);
  if (!clean) return { ok: false, error: "Give the place a name." };
  const supabase = createClient();
  const tenant = await tenantId();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("transport_places").insert({ tenant_id: tenant, name: clean, created_by: user?.id ?? null });
  if (error) return { ok: false, error: /transport_places_tenant_name/.test(error.message) ? "That place is already saved." : error.message };
  rev();
  return { ok: true };
}

/** Forget a saved place. Requests that name it keep their text. */
export async function removePlace(id: string): Promise<ActionResult> {
  const gate = await requireModule("transportation", "manage");
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase.from("transport_places").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  rev();
  return { ok: true };
}

// Keep the pure helpers reachable from the actions module for callers that
// only import from here.
export { shuttleDepartAt, shuttleRunsOn };
