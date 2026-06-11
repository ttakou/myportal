/**
 * Employee Emergency Support System (EESS) — shared types & labels.
 *
 * Mirrors the enums declared in supabase/migrations/0024_emergency_module.sql.
 * Kept hand-written (like the rest of src/types) so the app compiles without the
 * Supabase type generator wired up.
 */

export type IncidentType =
  | "medical"
  | "fire"
  | "facility"
  | "active_threat"
  | "other";

export type IncidentStatus = "open" | "acknowledged" | "responding" | "resolved";

export type Severity = "info" | "warning" | "critical";

export type CheckinStatus = "safe" | "need_help";

export const INCIDENT_LABEL: Record<IncidentType, string> = {
  medical: "Medical emergency",
  fire: "Fire / hazard",
  facility: "Facility issue",
  active_threat: "Active threat",
  other: "SOS",
};

/** Lucide icon name per category (resolved client-side). */
export const INCIDENT_ICON: Record<IncidentType, string> = {
  medical: "HeartPulse",
  fire: "Flame",
  facility: "TriangleAlert",
  active_threat: "ShieldAlert",
  other: "Siren",
};

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  responding: "Responding",
  resolved: "Resolved",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Informational",
  warning: "Warning",
  critical: "Critical",
};

/**
 * Dynamic safety guidance shown on the confirmation screen after an SOS/report.
 * Deliberately short, imperative, and readable under stress.
 */
export const SAFETY_INSTRUCTIONS: Record<IncidentType, string[]> = {
  medical: [
    "Stay with the casualty and keep them calm.",
    "Do not move them unless they are in immediate danger.",
    "A responder and first-aid team have been alerted.",
  ],
  fire: [
    "Leave the area immediately by the nearest safe exit.",
    "Do not use lifts. Close doors behind you.",
    "Proceed to your assembly point and check in as safe.",
  ],
  facility: [
    "Move away from the affected area.",
    "Do not attempt repairs yourself.",
    "Facilities and the safety team have been notified.",
  ],
  active_threat: [
    "Run if you can, hide if you cannot, stay silent.",
    "Silence your phone and lock/barricade the door.",
    "Wait for the all-clear from the safety team.",
  ],
  other: [
    "Stay where you are if it is safe to do so.",
    "Keep your phone on and reachable.",
    "The safety team has received your alert.",
  ],
};

export interface Incident {
  id: string;
  incident_type: IncidentType;
  severity: Severity;
  status: IncidentStatus;
  is_sos: boolean;
  note: string | null;
  location_text: string | null;
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
  reporter_name: string | null;
  reporter_department: string | null;
  created_at: string;
  // Resolution trail — only populated by the history read.
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  resolved_by_name?: string | null;
}

export interface Broadcast {
  id: string;
  title: string;
  message: string;
  severity: Severity;
  channels: string[];
  location_label: string | null;
  center_lat: number | null;
  center_lng: number | null;
  radius_m: number | null;
  requires_checkin: boolean;
  is_active: boolean;
  created_by_name: string | null;
  created_at: string;
}

export interface Checkin {
  id: string;
  status: CheckinStatus;
  note: string | null;
  lat: number | null;
  lng: number | null;
  broadcast_id: string | null;
  person_name: string | null;
  department: string | null;
  created_at: string;
}

/** Roster row with the person's latest accountability status for an event. */
export interface AccountabilityRow {
  profile_id: string;
  full_name: string | null;
  department: string | null;
  status: CheckinStatus | "unaccounted";
  note: string | null;
  lat: number | null;
  lng: number | null;
}

export interface Accountability {
  total: number;
  safe: number;
  needHelp: number;
  unaccounted: number;
  rows: AccountabilityRow[];
}

/** One push fan-out, recorded for the command center's delivery audit trail. */
export interface DeliveryLog {
  id: string;
  source_type: "incident" | "broadcast";
  audience: "responders" | "all";
  channel: string;
  recipients: number;
  sent: number;
  delivered: number;
  failed: number;
  created_at: string;
}
