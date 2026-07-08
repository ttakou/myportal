// Single source of truth for the offshore module's sub-views. The sidebar
// renders these as an indented submenu (icons are lucide names), and the
// management component reads the active key from the `?view=` query param so
// only one view shows at a time.

export type OffshoreViewKey =
  | "dashboard"
  | "board"
  | "crews"
  | "calendar"
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
  { key: "history", label: "History", icon: "History" },
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

/** Consolidated sidebar submenu: one entry per hub, gated like the flat list. */
export function offshoreHubSubmenu(canManage: boolean): OffshoreNavItem[] {
  const hubs = canManage ? OFFSHORE_HUBS : OFFSHORE_HUBS.filter((h) => h.key === "mytrips");
  return hubs.map((h) => ({
    key: h.key,
    label: h.label,
    icon: h.icon,
    href: `/offshore?view=${h.key}`,
    matchViews: h.tabs?.map((t) => t.key),
  }));
}
