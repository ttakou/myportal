// Single source of truth for the offshore module's sub-views. The sidebar
// renders these as an indented submenu (icons are lucide names), and the
// management component reads the active key from the `?view=` query param so
// only one view shows at a time.

export type OffshoreViewKey =
  | "dashboard"
  | "crews"
  | "calendar"
  | "manifests"
  | "rooms"
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
  { key: "crews", label: "Crew change", icon: "CalendarClock" },
  { key: "calendar", label: "Rotation calendar", icon: "CalendarRange" },
  { key: "manifests", label: "Manifests", icon: "ClipboardList" },
  { key: "rooms", label: "Accommodation", icon: "BedDouble" },
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
