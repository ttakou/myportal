"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import type {
  CheckinStatus,
  IncidentStatus,
  IncidentType,
  Severity,
} from "@/types/emergency";

export interface ActionResult {
  ok: boolean;
  error?: string;
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

  const { error } = await supabase.from("eess_incidents").insert({
    reporter_id: user.id,
    incident_type: input.incidentType,
    severity: severityFor(input.incidentType),
    is_sos: input.isSos ?? false,
    note: input.note?.trim() || null,
    location_text: input.locationText?.trim() || null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    photo_url: input.photoUrl ?? null,
  });
  if (error) return { ok: false, error: error.message };
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
  if (!(await getAccess()).isSafetyAdmin) return { ok: false, error: "Not authorized." };
  if (!input.title.trim() || !input.message.trim()) {
    return { ok: false, error: "Title and message are required." };
  }
  const channels = ["push", "sms", "email"].filter((c) => input.channels.includes(c));
  if (channels.length === 0) return { ok: false, error: "Pick at least one channel." };

  const supabase = createClient();
  const { error } = await supabase.from("eess_broadcasts").insert({
    title: input.title.trim(),
    message: input.message.trim(),
    severity: input.severity,
    channels,
    location_label: input.locationLabel?.trim() || null,
    center_lat: input.centerLat ?? null,
    center_lng: input.centerLng ?? null,
    radius_m: input.radiusM ?? null,
    requires_checkin: input.requiresCheckin,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/emergency");
  revalidatePath("/emergency/command");
  return { ok: true };
}

export async function setBroadcastActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  if (!(await getAccess()).isSafetyAdmin) return { ok: false, error: "Not authorized." };
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
  if (!(await getAccess()).isSafetyAdmin) return { ok: false, error: "Not authorized." };
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
