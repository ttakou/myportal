import { createClient } from "@/lib/supabase/server";
import type {
  Accountability,
  AccountabilityRow,
  Broadcast,
  Checkin,
  CheckinStatus,
  DeliveryLog,
  Incident,
} from "@/types/emergency";
import { one } from "@/lib/supabase/row-helpers";

// ---------------------------------------------------------------------------
// Row mappers (Supabase types embedded relations as arrays; they're 1:1 here)
// ---------------------------------------------------------------------------

const INCIDENT_SELECT =
  "id, incident_type, severity, status, is_sos, note, location_text, lat, lng, photo_url, created_at," +
  " reporter:profiles!eess_incidents_reporter_id_fkey(full_name, department)";

function mapIncident(row: Record<string, any>): Incident {
  const r = one<{ full_name: string | null; department: string | null }>(row.reporter);
  return {
    id: row.id,
    incident_type: row.incident_type,
    severity: row.severity,
    status: row.status,
    is_sos: row.is_sos,
    note: row.note,
    location_text: row.location_text,
    lat: row.lat,
    lng: row.lng,
    photo_url: row.photo_url,
    reporter_name: r?.full_name ?? null,
    reporter_department: r?.department ?? null,
    created_at: row.created_at,
  };
}

// History adds the resolution trail (timestamps + who resolved it).
const INCIDENT_HISTORY_SELECT =
  INCIDENT_SELECT +
  ", acknowledged_at, resolved_at," +
  " resolver:profiles!eess_incidents_resolved_by_fkey(full_name)";

function mapIncidentHistory(row: Record<string, any>): Incident {
  const resolver = one<{ full_name: string | null }>(row.resolver);
  return {
    ...mapIncident(row),
    acknowledged_at: row.acknowledged_at ?? null,
    resolved_at: row.resolved_at ?? null,
    resolved_by_name: resolver?.full_name ?? null,
  };
}

const BROADCAST_SELECT =
  "id, title, message, severity, channels, location_label, center_lat, center_lng," +
  " radius_m, requires_checkin, is_active, created_at," +
  " author:profiles!eess_broadcasts_created_by_fkey(full_name)";

function mapBroadcast(row: Record<string, any>): Broadcast {
  const a = one<{ full_name: string | null }>(row.author);
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    severity: row.severity,
    channels: row.channels ?? [],
    location_label: row.location_label,
    center_lat: row.center_lat,
    center_lng: row.center_lng,
    radius_m: row.radius_m,
    requires_checkin: row.requires_checkin,
    is_active: row.is_active,
    created_by_name: a?.full_name ?? null,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Employee-facing reads
// ---------------------------------------------------------------------------

/** Active alerts for the tenant, newest first. */
export async function getActiveBroadcasts(): Promise<Broadcast[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("eess_broadcasts")
    .select(BROADCAST_SELECT)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => mapBroadcast(r as Record<string, any>));
}

/** The signed-in user's current check-in for a given event (or general one). */
export async function getMyCheckin(
  broadcastId: string | null,
): Promise<{ status: CheckinStatus; note: string | null } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let q = supabase
    .from("eess_checkins")
    .select("status, note, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  q = broadcastId ? q.eq("broadcast_id", broadcastId) : q.is("broadcast_id", null);

  const { data } = await q.maybeSingle();
  return data ? { status: data.status, note: data.note } : null;
}

/** Incidents the signed-in user has reported. */
export async function getMyIncidents(): Promise<Incident[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("eess_incidents")
    .select(INCIDENT_SELECT)
    .eq("reporter_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((r) => mapIncident(r as Record<string, any>));
}

// ---------------------------------------------------------------------------
// Command center reads (safety admins)
// ---------------------------------------------------------------------------

/** Every incident in the tenant, newest first (RLS gates this to safety admins). */
export async function getAllIncidents(): Promise<Incident[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("eess_incidents")
    .select(INCIDENT_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("getAllIncidents:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapIncident(r as Record<string, any>));
}

/**
 * Full incident history for the tenant, newest first, with the resolution trail.
 * RLS gates this to safety admins (eess_incidents_select_admin).
 */
export async function getIncidentHistory(): Promise<Incident[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("eess_incidents")
    .select(INCIDENT_HISTORY_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("getIncidentHistory:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapIncidentHistory(r as Record<string, any>));
}

/**
 * Roster accountability for an event. `total` is the tenant's active headcount;
 * each person is Safe, Needs assistance, or Unaccounted-for. When `broadcastId`
 * is null we count standalone (non-event) check-ins.
 */
export async function getAccountability(
  broadcastId: string | null,
): Promise<Accountability> {
  const supabase = createClient();

  const rosterPromise = supabase
    .from("profiles")
    .select("id, full_name, department")
    .eq("is_active", true)
    .order("full_name");

  let checkinQuery = supabase
    .from("eess_checkins")
    .select("profile_id, status, note, lat, lng, created_at")
    .order("created_at", { ascending: false });
  checkinQuery = broadcastId
    ? checkinQuery.eq("broadcast_id", broadcastId)
    : checkinQuery.is("broadcast_id", null);

  const [{ data: roster }, { data: checkins }] = await Promise.all([
    rosterPromise,
    checkinQuery,
  ]);

  // Latest check-in per person (rows already sorted newest-first).
  const latest = new Map<string, Record<string, any>>();
  for (const c of checkins ?? []) {
    if (!latest.has(c.profile_id)) latest.set(c.profile_id, c);
  }

  const rows: AccountabilityRow[] = (roster ?? []).map((p) => {
    const c = latest.get(p.id);
    const status: AccountabilityRow["status"] = c
      ? (c.status as CheckinStatus)
      : "unaccounted";
    return {
      profile_id: p.id,
      full_name: p.full_name,
      department: p.department,
      status,
      note: c?.note ?? null,
      lat: c?.lat ?? null,
      lng: c?.lng ?? null,
    };
  });

  const safe = rows.filter((r) => r.status === "safe").length;
  const needHelp = rows.filter((r) => r.status === "need_help").length;
  const unaccounted = rows.filter((r) => r.status === "unaccounted").length;

  return { total: rows.length, safe, needHelp, unaccounted, rows };
}

/** Recent notification fan-outs for the tenant (RLS gates this to safety admins). */
export async function getRecentDeliveries(limit = 10): Promise<DeliveryLog[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("eess_delivery_log")
    .select("id, source_type, audience, channel, recipients, sent, delivered, failed, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as DeliveryLog[];
}

/** People who selected "I need assistance" for the given event, with locations. */
export async function getHelpRequests(broadcastId: string | null): Promise<Checkin[]> {
  const supabase = createClient();
  let q = supabase
    .from("eess_checkins")
    .select(
      "id, status, note, lat, lng, broadcast_id, created_at," +
        " person:profiles!eess_checkins_profile_id_fkey(full_name, department)",
    )
    .eq("status", "need_help")
    .order("created_at", { ascending: false });
  q = broadcastId ? q.eq("broadcast_id", broadcastId) : q.is("broadcast_id", null);

  const { data } = await q;
  return (data ?? []).map((row: Record<string, any>) => {
    const person = one<{ full_name: string | null; department: string | null }>(row.person);
    return {
      id: row.id,
      status: row.status,
      note: row.note,
      lat: row.lat,
      lng: row.lng,
      broadcast_id: row.broadcast_id,
      person_name: person?.full_name ?? null,
      department: person?.department ?? null,
      created_at: row.created_at,
    };
  });
}
