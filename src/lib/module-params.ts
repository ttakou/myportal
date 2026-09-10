/**
 * Per-module configurable parameters.
 *
 * Values live in tenant_services.settings (jsonb) so each tenant tunes its own
 * modules; the *schema* lives here so the admin console can render forms and
 * the modules read typed, defaulted values. Every parameter defined below is
 * consumed somewhere — don't add knobs that nothing reads.
 */

export type ModuleParamValue = boolean | number | string;

export interface ModuleParamDef {
  key: string;
  label: string;
  help?: string;
  type: "boolean" | "number" | "select" | "text";
  default: ModuleParamValue;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

export const MODULE_PARAMS: Record<string, ModuleParamDef[]> = {
  visitors: [
    {
      key: "after_hours_from",
      label: "After hours begin (site time)",
      help: "Entries from this time are flagged after-hours on the access register. HH:MM.",
      type: "text",
      default: "18:00",
    },
    {
      key: "after_hours_to",
      label: "After hours end (site time)",
      help: "Entries before this time are flagged after-hours. HH:MM.",
      type: "text",
      default: "06:00",
    },
    {
      key: "overstay_alert_time",
      label: "Alert security about visitors still on site after (site time)",
      help: "Every 15 minutes past this time, anyone still checked in is reported to security and their host, once a day. HH:MM; blank switches it off.",
      type: "text",
      default: "20:00",
    },
    {
      key: "no_exit_hours",
      label: "Flag an entry with no exit after (hours)",
      type: "number",
      default: 24,
      min: 1,
      max: 168,
    },
    {
      key: "expected_list_evening",
      label: "Send tomorrow's expected visitors each evening",
      help: "Reception gets the full list, each host their own, at 17:00 site time.",
      type: "boolean",
      default: true,
    },
    {
      key: "auto_no_show",
      label: "Mark visitors who never came as no-shows",
      help: "A pre-registered visit whose date has passed without a check-in is closed as a no-show by the evening job.",
      type: "boolean",
      default: true,
    },
  ],
  emergency: [
    {
      key: "push_incident_alerts",
      label: "Page responders on incident / SOS",
      help: "Push + in-app alert to safety admins when an incident or SOS is reported.",
      type: "boolean",
      default: true,
    },
    {
      key: "push_broadcasts",
      label: "Push broadcasts to all employees",
      help: "Deliver mass broadcasts over Web Push in addition to the in-app banner.",
      type: "boolean",
      default: true,
    },
  ],
  transportation: [
    {
      key: "approval_escalation_hours",
      label: "Escalate unanswered approvals after (hours)",
      help: "A request the line manager has not decided within this time goes to the dispatch desk. 0 never escalates.",
      type: "number",
      default: 24,
      min: 0,
      max: 336,
    },
    {
      key: "require_approval",
      label: "Line manager approves ride requests",
      help: "A request waits on the requester's line manager before the dispatch desk sees it. People with no manager on file go straight to dispatch.",
      type: "boolean",
      default: false,
    },
    {
      key: "allow_employee_requests",
      label: "Employees can request rides",
      help: "When off, only the dispatch desk can create tasks.",
      type: "boolean",
      default: true,
    },
    {
      key: "driver_reminder_minutes",
      label: "Remind the driver before departure (minutes)",
      help: "A driver with a portal account is nudged this long before a task departs. 0 switches it off.",
      type: "number",
      default: 30,
      min: 0,
      max: 720,
    },
    {
      key: "late_start_alert_minutes",
      label: "Alert the desk when a task has not started after (minutes)",
      help: "Past departure by this much with no driver on the way, the dispatch desk and the driver are alerted. 0 switches it off.",
      type: "number",
      default: 15,
      min: 0,
      max: 720,
    },
    {
      key: "conflict_window_hours",
      label: "Double-booking warning window (hours)",
      help: "Warn the dispatcher when an assigned driver has another task within ± this many hours.",
      type: "number",
      default: 2,
      min: 0,
      max: 24,
    },
    {
      key: "push_on_assignment",
      label: "Notify drivers on assignment",
      help: "Push + in-app notification to the driver when a task is assigned to them.",
      type: "boolean",
      default: true,
    },
    {
      key: "seed_checklists",
      label: "Seed task checklists",
      help: "Pre-fill new tasks with the standard checklist for their task type.",
      type: "boolean",
      default: true,
    },
  ],
  "out-of-town": [
    {
      key: "notify_manager_on_submission",
      label: "Alert supervisors on travel submissions",
      help: "Push + in-app alert to the requester's manager when a declaration needs approval.",
      type: "boolean",
      default: true,
    },
    {
      key: "meetgreet_creates_pickup_task",
      label: "Meet & greet creates a dispatch pickup task",
      help: "Requesting airport assistance auto-creates an airport-pickup task on the transport board.",
      type: "boolean",
      default: true,
    },
    {
      key: "flight_disruption_alerts",
      label: "Flight disruption alerts",
      help: "Scheduled flight tracking alerts the traveller + travel desk on delays, cancellations and diversions.",
      type: "boolean",
      default: true,
    },
  ],
};

export type ModuleSettings = Record<string, ModuleParamValue>;

/** Merge stored jsonb over the registry defaults (unknown keys pass through). */
export function withDefaults(slug: string, raw: unknown): ModuleSettings {
  const out: ModuleSettings = {};
  for (const def of MODULE_PARAMS[slug] ?? []) out[def.key] = def.default;
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") out[k] = v;
    }
  }
  return out;
}
