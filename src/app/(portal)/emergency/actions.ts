"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/permissions-server";
import { notify } from "@/lib/eess-notify";
import { getModuleSettings } from "@/lib/module-settings";
import {
  INCIDENT_LABEL,
  type CheckinStatus,
  type IncidentStatus,
  type IncidentType,
  type Severity,
} from "@/types/emergency";

import type { ActionResult as BaseActionResult } from "@/types/actions";

export interface ActionResult extends BaseActionResult {
  incidentId?: string;
}

const INCIDENT_TYPES: IncidentType[] = [
  "medical",
  "fire",
  "facility",
  "active_threat",
  "other",
];

/** Default severity per category — facility issues warn, everything else is critical. */
function severityFor(type: IncidentType): Severity {
  return type === "facility" ? "warning" : "critical";
}

// ---------------------------------------------------------------------------
// A. SOS & incident reporting (any employee)
// ---------------------------------------------------------------------------
export async function reportIncident(input: {
  incidentType: IncidentType;
  isSos?: boolean;
  note?: string;
  locationText?: string;
  lat?: number | null;
  lng?: number | null;
  photoUrl?: string | null;
}): Promise<ActionResult> {
  if (!INCIDENT_TYPES.includes(input.incidentType)) {
    return { ok: false, error: "Unknown incident category." };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const severity = severityFor(input.incidentType);
  const { data: incident, error } = await supabase
    .from("eess_incidents")
    .insert({
      reporter_id: user.id,
      incident_type: input.incidentType,
      severity,
      is_sos: input.isSos ?? false,
      note: input.note?.trim() || null,
      location_text: input.locationText?.trim() || null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      photo_url: input.photoUrl ?? null,
    })
    .select("id, tenant_id")
    .single();
  if (error) return { ok: false, error: error.message };

  // Page the response team. Best-effort; never blocks the report from succeeding.
  const eessCfg = await getModuleSettings("emergency");
  if (incident?.tenant_id && eessCfg.push_incident_alerts !== false) {
    const label = INCIDENT_LABEL[input.incidentType];
    const where = input.locationText?.trim();
    await notify({
      tenantId: incident.tenant_id,
      audience: "responders",
      sourceType: "incident",
      sourceId: incident.id,
      payload: {
        title: input.isSos ? `🚨 SOS — ${label}` : `🚨 ${label} reported`,
        body:
          [input.note?.trim(), where ? `Location: ${where}` : null]
            .filter(Boolean)
            .join(" · ") || "Open the command center to respond.",
        url: "/emergency/command",
        tag: `incident-${incident.id}`,
        severity,
      },
    });
  }

  revalidatePath("/emergency");
  revalidatePath("/emergency/command");
  return { ok: true, incidentId: incident.id };
}

/**
 * Attach (or refine) a reported incident's location after the fact. The SOS
 * flow fires the alert immediately and enriches it with GPS — or a typed
 * description — as soon as that becomes available, so a slow/blocked GPS never
 * delays the alert. Scoped to the reporter's own incident via a SECURITY
 * DEFINER function that only ever touches the location columns.
 */
export async function attachIncidentLocation(input: {
  incidentId: string;
  lat?: number | null;
  lng?: number | null;
  locationText?: string | null;
}): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc("eess_set_incident_location", {
    p_id: input.incidentId,
    p_lat: input.lat ?? null,
    p_lng: input.lng ?? null,
    p_text: input.locationText?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/emergency/command");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// C. Safety check-in / accountability (any employee)
// ---------------------------------------------------------------------------
export async function submitCheckin(input: {
  status: CheckinStatus;
  broadcastId?: string | null;
  note?: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<ActionResult> {
  if (input.status !== "safe" && input.status !== "need_help") {
    return { ok: false, error: "Invalid status." };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const broadcastId = input.broadcastId ?? null;
  const payload = {
    status: input.status,
    note: input.note?.trim() || null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    updated_at: new Date().toISOString(),
  };

  // One check-in per person per event: update in place when it already exists.
  if (broadcastId) {
    const { data: existing } = await supabase
      .from("eess_checkins")
      .select("id")
      .eq("profile_id", user.id)
      .eq("broadcast_id", broadcastId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("eess_checkins")
        .update(payload)
        .eq("id", existing.id);
      if (error) return { ok: false, error: error.message };
      revalidatePath("/emergency");
      revalidatePath("/emergency/command");
      return { ok: true };
    }
  }

  const { error } = await supabase
    .from("eess_checkins")
    .insert({ broadcast_id: broadcastId, ...payload });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/emergency");
  revalidatePath("/emergency/command");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// B. Mass broadcast & geofenced alerts (safety admins)
// ---------------------------------------------------------------------------
export async function sendBroadcast(input: {
  title: string;
  message: string;
  severity: Severity;
  channels: string[];
  locationLabel?: string;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusM?: number | null;
  requiresCheckin: boolean;
}): Promise<ActionResult> {
  const gate = await requireModule("emergency", "manage", (a) => a.isSafetyAdmin);
  if (gate) return gate;
  if (!input.title.trim() || !input.message.trim()) {
    return { ok: false, error: "Title and message are required." };
  }
  const channels = ["push", "sms", "email"].filter((c) => input.channels.includes(c));
  if (channels.length === 0) return { ok: false, error: "Pick at least one channel." };

  const supabase = createClient();
  const { data: broadcast, error } = await supabase
    .from("eess_broadcasts")
    .insert({
      title: input.title.trim(),
      message: input.message.trim(),
      severity: input.severity,
      channels,
      location_label: input.locationLabel?.trim() || null,
      center_lat: input.centerLat ?? null,
      center_lng: input.centerLng ?? null,
      radius_m: input.radiusM ?? null,
      requires_checkin: input.requiresCheckin,
    })
    .select("id, tenant_id")
    .single();
  if (error) return { ok: false, error: error.message };

  // Fan the alert out to every employee over Web Push (other channels TBD).
  const eessCfg = await getModuleSettings("emergency");
  if (channels.includes("push") && broadcast?.tenant_id && eessCfg.push_broadcasts !== false) {
    await notify({
      tenantId: broadcast.tenant_id,
      audience: "all",
      sourceType: "broadcast",
      sourceId: broadcast.id,
      payload: {
        title: input.title.trim(),
        body: input.message.trim(),
        url: "/emergency",
        tag: `broadcast-${broadcast.id}`,
        severity: input.severity,
      },
    });
  }

  revalidatePath("/emergency");
  revalidatePath("/emergency/command");
  return { ok: true };
}

export async function setBroadcastActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const gate = await requireModule("emergency", "manage", (a) => a.isSafetyAdmin);
  if (gate) return gate;
  const supabase = createClient();
  const { error } = await supabase
    .from("eess_broadcasts")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/emergency");
  revalidatePath("/emergency/command");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Incident triage (safety admins)
// ---------------------------------------------------------------------------
export async function setIncidentStatus(
  id: string,
  status: IncidentStatus,
): Promise<ActionResult> {
  const gate = await requireModule("emergency", "approve", (a) => a.isSafetyAdmin);
  if (gate) return gate;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "acknowledged" || status === "responding") {
    patch.acknowledged_by = user?.id ?? null;
    patch.acknowledged_at = new Date().toISOString();
  }
  if (status === "resolved") {
    patch.resolved_by = user?.id ?? null;
    patch.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase.from("eess_incidents").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/emergency");
  revalidatePath("/emergency/command");
  return { ok: true };
}
