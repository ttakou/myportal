"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/permissions-server";
import { notify, notifyProfiles } from "@/lib/eess-notify";
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

/**
 * Post a follow-up update to your OWN incident while it is still open. Appends an
 * entry to the incident's evolution timeline and, when a location is shared,
 * refreshes the incident's position so the command-center map tracks the
 * reporter. Resolved incidents are closed to further updates.
 */
export async function addIncidentUpdate(input: {
  incidentId: string;
  body?: string;
  lat?: number | null;
  lng?: number | null;
  locationText?: string | null;
}): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const body = input.body?.trim() || null;
  const locText = input.locationText?.trim() || null;
  const hasCoords = input.lat != null && input.lng != null;
  if (!body && !locText && !hasCoords) {
    return { ok: false, error: "Add a note or share your location." };
  }

  // Defence-in-depth: RLS also enforces ownership + the open-status guard.
  const { data: incident } = await supabase
    .from("eess_incidents")
    .select("reporter_id, tenant_id, incident_type, status")
    .eq("id", input.incidentId)
    .maybeSingle();
  if (!incident) return { ok: false, error: "Incident not found." };
  if (incident.reporter_id !== user.id) {
    return { ok: false, error: "You can only update your own SOS." };
  }
  if (incident.status === "resolved") {
    return { ok: false, error: "This incident is resolved and can no longer be updated." };
  }

  const { error } = await supabase.from("eess_incident_updates").insert({
    incident_id: input.incidentId,
    author_id: user.id,
    kind: hasCoords || locText ? "location" : "note",
    body,
    lat: hasCoords ? input.lat : null,
    lng: hasCoords ? input.lng : null,
  });
  if (error) return { ok: false, error: error.message };

  // Mirror the latest location onto the incident itself (command-center map).
  if (hasCoords || locText) {
    await supabase.rpc("eess_set_incident_location", {
      p_id: input.incidentId,
      p_lat: input.lat ?? null,
      p_lng: input.lng ?? null,
      p_text: locText,
    });
  }

  // Page the response team with the reporter's new information so a live SOS is
  // never updated in silence. Best-effort; never blocks the update.
  if (incident.tenant_id) {
    const eessCfg = await getModuleSettings("emergency");
    if (eessCfg.push_incident_alerts !== false) {
      const label = INCIDENT_LABEL[incident.incident_type as IncidentType];
      await notify({
        tenantId: incident.tenant_id,
        audience: "responders",
        sourceType: "incident",
        sourceId: input.incidentId,
        payload: {
          title: `Update on ${label} alert`,
          body: body || (hasCoords ? "Reporter shared a refreshed location." : "Location updated."),
          url: "/emergency/command",
          tag: `incident-${input.incidentId}`,
          severity: "warning",
        },
      });
    }
  }

  revalidatePath("/emergency");
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

  // Read the incident first: we need who reported it (to notify) and its current
  // status (to skip the notification on a no-op re-set of the same status).
  const { data: before } = await supabase
    .from("eess_incidents")
    .select("reporter_id, tenant_id, incident_type, status")
    .eq("id", id)
    .maybeSingle();

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

  // Close the loop: let the reporter know a responder has acted on their alert.
  // Best-effort and never the actor themselves (status changes are made by
  // responders). Skipped when nothing actually changed or push is disabled.
  if (
    before?.reporter_id &&
    before.tenant_id &&
    before.status !== status &&
    before.reporter_id !== user?.id
  ) {
    const eessCfg = await getModuleSettings("emergency");
    if (eessCfg.push_incident_alerts !== false) {
      const label = INCIDENT_LABEL[before.incident_type as IncidentType];
      const msg = STATUS_NOTIFY[status];
      if (msg) {
        await notifyProfiles({
          tenantId: before.tenant_id,
          profileIds: [before.reporter_id],
          audience: "reporter",
          sourceType: "incident",
          sourceId: id,
          payload: {
            title: msg.title(label),
            body: msg.body,
            url: "/emergency",
            tag: `incident-${id}`,
            severity: status === "resolved" ? "info" : "warning",
          },
        });
      }
    }
  }

  revalidatePath("/emergency");
  revalidatePath("/emergency/command");
  return { ok: true };
}

/** Reporter-facing copy for each status a responder can move an incident to. */
const STATUS_NOTIFY: Partial<
  Record<IncidentStatus, { title: (label: string) => string; body: string }>
> = {
  acknowledged: {
    title: (label) => `Your ${label} alert was acknowledged`,
    body: "The safety team has seen your report and is assessing it.",
  },
  responding: {
    title: (label) => `Help is on the way for your ${label} alert`,
    body: "A responder is now actively responding.",
  },
  resolved: {
    title: (label) => `Your ${label} alert was resolved`,
    body: "The safety team has marked your report as resolved.",
  },
};
