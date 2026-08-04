// Single source of truth for the offshore module's sub-views. The sidebar
// renders these as an indented submenu (icons are lucide names), and the
// management component reads the active key from the `?view=` query param so
// only one view shows at a time.

export type OffshoreViewKey =
  | "dashboard"
  | "board"
  | "crews"
  | "calendar"
  | "attendance"
  | "manifests"
  | "rooms"
  | "bedboard"
  | "catering"
  | "roster"
  | "assign"
  | "visitors"
  | "emergency"
  | "drill"
  | "installations"
  | "history"
  | "staff-history"
  | "mytrips";

export interface OffshoreView {
  key: OffshoreViewKey;
  label: string;
  /** lucide-react icon name (PascalCase). */
  icon: string;
}

/**
 * Ordered submenu. "mytrips" is the self-service area (shown to everyone with
 * the module); the rest are management views (admin / Campboss / OIM only).
 */
export const OFFSHORE_VIEWS: OffshoreView[] = [
  { key: "mytrips", label: "My trips & requests", icon: "Ship" },
  { key: "dashboard", label: "POB & dashboards", icon: "LayoutGrid" },
  { key: "board", label: "Live board", icon: "Radio" },
  { key: "crews", label: "Crew change", icon: "CalendarClock" },
  { key: "calendar", label: "Rotation calendar", icon: "CalendarRange" },
  { key: "attendance", label: "Attendance flags", icon: "UserX" },
  { key: "manifests", label: "Manifests", icon: "ClipboardList" },
  { key: "rooms", label: "Accommodation", icon: "BedDouble" },
  { key: "bedboard", label: "Bed board", icon: "BedSingle" },
  { key: "catering", label: "Catering", icon: "UtensilsCrossed" },
  { key: "roster", label: "Offshore staff", icon: "Users" },
  { key: "assign", label: "Assign crews", icon: "UserCog" },
  { key: "visitors", label: "Visitors", icon: "Plane" },
  { key: "emergency", label: "Muster roles", icon: "LifeBuoy" },
  { key: "drill", label: "Muster drill", icon: "Siren" },
  { key: "installations", label: "Installations", icon: "Anchor" },
  { key: "history", label: "History", icon: "History" },
  { key: "staff-history", label: "Staff rotations", icon: "CalendarClock" },
];

export const OFFSHORE_VIEW_KEYS = OFFSHORE_VIEWS.map((v) => v.key);

/**
 * Submenu shown in the sidebar. Everyone with the module sees "My trips";
 * only managers (admin / Campboss / OIM) additionally see the management views.
 */
export function offshoreSubmenu(canManage: boolean): OffshoreView[] {
  return canManage ? OFFSHORE_VIEWS : OFFSHORE_VIEWS.filter((v) => v.key === "mytrips");
}

/** Landing view for managers (the self-service "mytrips" is the default otherwise). */
export const DEFAULT_OFFSHORE_VIEW: OffshoreViewKey = "dashboard";

/** Resolve a raw `?view=` value to a known management view, else the default. */
export function resolveManagementView(raw: string | null | undefined): OffshoreViewKey {
  if (raw && raw !== "mytrips" && (OFFSHORE_VIEW_KEYS as string[]).includes(raw)) {
    return raw as OffshoreViewKey;
  }
  return DEFAULT_OFFSHORE_VIEW;
}

// =============================================================================
// Consolidated sidebar: the 16 flat views collapse into 9 entries ("hubs").
// A hub's sub-views render as a tab bar in the management area; each tab links
// straight to the original `?view=` key, so deep-links, gating and the
// one-panel-at-a-time switch are untouched.
// =============================================================================

// =============================================================================
// Per-role access to the management sub-views.
//
//   full → see the view and use its write controls
//   view → see the view read-only (write controls disabled/hidden)
//   none → the view (and its sidebar entry / tab) is hidden entirely
//
// Full managers (admin / Campboss / OIM) get "full" on everything. The
// Dispatcher runs crew rotation, travel & manifests and the offshore-staff
// roster in full, and sees POB / live board and accommodation read-only.
// Anyone else gets no management views (self-service "My trips" only).
// =============================================================================

export type OffshorePerm = "none" | "view" | "full";

export interface OffshoreRoleFlags {
  /** admin / Campboss / OIM — full control of every offshore view. */
  manager: boolean;
  /** Offshore Dispatcher — full crew/travel/roster, read-only POB & rooms. */
  dispatcher: boolean;
}

const DISPATCHER_VIEW_PERMS: Record<OffshoreViewKey, OffshorePerm> = {
  mytrips: "full",
  dashboard: "view",
  board: "view",
  crews: "full",
  calendar: "full",
  attendance: "full",
  manifests: "full",
  rooms: "view",
  bedboard: "view",
  catering: "none",
  roster: "full",
  assign: "full",
  visitors: "full",
  emergency: "none",
  drill: "none",
  installations: "none",
  history: "none",
  "staff-history": "none",
};

/** The Dispatcher's (or full manager's) access level for one management view. */
export function offshoreViewPerm(key: OffshoreViewKey, flags: OffshoreRoleFlags): OffshorePerm {
  if (flags.manager) return "full";
  if (flags.dispatcher) return DISPATCHER_VIEW_PERMS[key] ?? "none";
  return "none";
}

/** True when the user may see any management view at all (vs. self-service only). */
export function canSeeOffshoreManagement(flags: OffshoreRoleFlags): boolean {
  return flags.manager || flags.dispatcher;
}

/** First management view the user may open — the landing view after "My trips". */
export function firstOffshoreManagementView(flags: OffshoreRoleFlags): OffshoreViewKey {
  const hit = OFFSHORE_VIEWS.find(
    (v) => v.key !== "mytrips" && offshoreViewPerm(v.key, flags) !== "none",
  );
  return hit?.key ?? DEFAULT_OFFSHORE_VIEW;
}

export interface OffshoreHubTab {
  key: OffshoreViewKey;
  label: string;
}

export interface OffshoreHub {
  /** Landing view — the tab shown when the sidebar entry is clicked. */
  key: OffshoreViewKey;
  label: string;
  icon: string;
  /** All views the hub contains (first = landing). Absent = single view. */
  tabs?: OffshoreHubTab[];
}

export const OFFSHORE_HUBS: OffshoreHub[] = [
  { key: "mytrips", label: "My trips & requests", icon: "Ship" },
  {
    key: "dashboard", label: "POB & Live Board", icon: "LayoutGrid",
    tabs: [
      { key: "dashboard", label: "Overview" },
      { key: "board", label: "Live board" },
      { key: "catering", label: "Catering" },
    ],
  },
  {
    key: "crews", label: "Crew Rotation", icon: "CalendarClock",
    tabs: [
      { key: "crews", label: "Crew change" },
      { key: "calendar", label: "Rotation calendar" },
      { key: "attendance", label: "Attendance" },
    ],
  },
  {
    key: "roster", label: "Offshore Staff", icon: "Users",
    tabs: [
      { key: "roster", label: "Staff roster" },
      { key: "assign", label: "Assign crews" },
    ],
  },
  {
    key: "rooms", label: "Accommodation", icon: "BedDouble",
    tabs: [
      { key: "rooms", label: "Rooms" },
      { key: "bedboard", label: "Bed board" },
    ],
  },
  {
    key: "manifests", label: "Travel & Manifests", icon: "ClipboardList",
    tabs: [
      { key: "manifests", label: "Manifests" },
      { key: "visitors", label: "Visitors" },
    ],
  },
  {
    key: "emergency", label: "Emergency & Muster", icon: "LifeBuoy",
    tabs: [
      { key: "emergency", label: "Muster roles" },
      { key: "drill", label: "Muster drill" },
    ],
  },
  { key: "installations", label: "Installations", icon: "Anchor" },
  {
    key: "history", label: "History", icon: "History",
    tabs: [
      { key: "history", label: "Snapshots" },
      { key: "staff-history", label: "Staff rotations" },
    ],
  },
];

/** The hub a view belongs to (as landing view or tab), if any. */
export function hubForOffshoreView(key: OffshoreViewKey): OffshoreHub | null {
  return OFFSHORE_HUBS.find((h) => h.key === key || h.tabs?.some((t) => t.key === key)) ?? null;
}

export interface OffshoreNavItem {
  key: OffshoreViewKey;
  label: string;
  icon: string;
  href: string;
  /** All `?view=` values that keep this entry highlighted (the hub's tabs). */
  matchViews?: string[];
}

/** All view keys a hub covers (its landing key, or its tabs). */
function hubViewKeys(h: OffshoreHub): OffshoreViewKey[] {
  return h.tabs?.map((t) => t.key) ?? [h.key];
}

/**
 * Consolidated sidebar submenu: one entry per hub the user may see. A hub is
 * shown when at least one of its views is permitted (view or full); its landing
 * link and highlight-match set are trimmed to just the permitted views, so a
 * Dispatcher's "POB & Live Board" entry lands on the Overview and never exposes
 * the Catering tab.
 */
export function offshoreHubSubmenu(flags: OffshoreRoleFlags): OffshoreNavItem[] {
  if (!canSeeOffshoreManagement(flags)) {
    return OFFSHORE_HUBS.filter((h) => h.key === "mytrips").map((h) => ({
      key: h.key,
      label: h.label,
      icon: h.icon,
      href: `/offshore?view=${h.key}`,
    }));
  }
  const items: OffshoreNavItem[] = [];
  for (const h of OFFSHORE_HUBS) {
    const visible = hubViewKeys(h).filter((k) => offshoreViewPerm(k, flags) !== "none");
    if (visible.length === 0) continue;
    const landing = visible[0];
    items.push({
      key: landing,
      label: h.label,
      icon: h.icon,
      href: `/offshore?view=${landing}`,
      matchViews: h.tabs ? visible : undefined,
    });
  }
  return items;
}

/** The permitted sibling tabs of a hub, for the management area's tab bar. */
export function offshoreHubTabs(
  hub: OffshoreHub,
  flags: OffshoreRoleFlags,
): OffshoreHubTab[] {
  return (hub.tabs ?? []).filter((t) => offshoreViewPerm(t.key, flags) !== "none");
}
