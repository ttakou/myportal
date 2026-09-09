// Single source of truth for the transportation module's sub-views. The
// sidebar renders them as an indented submenu (icons are lucide names), and
// the page reads the active key from `?view=` so one view shows at a time —
// the same shape as the offshore hubs.

import type { NavSubItem } from "@/components/layout/nav-links";

export type TransportViewKey = "requests" | "new" | "approvals" | "dispatch" | "planner" | "fleet" | "shuttles" | "driver";

export interface TransportView {
  key: TransportViewKey;
  label: string;
  /** lucide-react icon name (PascalCase). */
  icon: string;
}

export const TRANSPORT_VIEWS: TransportView[] = [
  { key: "requests", label: "Transportation requests", icon: "ClipboardList" },
  { key: "new", label: "Request a transportation", icon: "Car" },
  { key: "approvals", label: "Approvals", icon: "CheckCircle2" },
  { key: "dispatch", label: "Dispatch board", icon: "Truck" },
  { key: "planner", label: "Day planner", icon: "CalendarClock" },
  { key: "fleet", label: "Vehicles & drivers", icon: "Wrench" },
  { key: "shuttles", label: "Shuttle schedules", icon: "Repeat" },
  { key: "driver", label: "My driving tasks", icon: "Navigation" },
];

export const TRANSPORT_VIEW_KEYS = TRANSPORT_VIEWS.map((v) => v.key);

export interface TransportFlags {
  /** Tenant or system admin: dispatches, and sees every request. */
  admin: boolean;
  /** Has direct reports: decides their ride requests when approval is on. */
  manager?: boolean;
  /** Linked to a driver record: has a task list of their own. */
  driver: boolean;
  /** Holds the transportation `create` verb: may raise a request. */
  canCreate: boolean;
  /** The Out of Town Trip module is enabled too; it joins the submenu. */
  outOfTown: boolean;
}

/** Whether a role may open a view. "requests" is everyone's: your own, or all for an admin. */
export function transportViewAllowed(key: TransportViewKey, flags: TransportFlags): boolean {
  switch (key) {
    case "requests":
      return true;
    case "new":
      return flags.canCreate || flags.admin;
    case "approvals":
      return Boolean(flags.manager) || flags.admin;
    case "dispatch":
    case "planner":
    case "fleet":
    case "shuttles":
      return flags.admin;
    case "driver":
      return flags.driver;
  }
}

/** Where the module lands without a `?view=`: a driver on their tasks, everyone else on the requests. */
export function defaultTransportView(flags: TransportFlags): TransportViewKey {
  return flags.driver && !flags.admin ? "driver" : "requests";
}

/** The view that will render for a raw `?view=` value, with the role fallback. */
export function resolveTransportView(raw: string | null | undefined, flags: TransportFlags): TransportViewKey {
  const key = (TRANSPORT_VIEW_KEYS as string[]).includes(raw ?? "") ? (raw as TransportViewKey) : null;
  if (key && transportViewAllowed(key, flags)) return key;
  return defaultTransportView(flags);
}

/** The submenu for the sidebar: the permitted views, then Out of Town Trip when enabled. */
export function transportSubmenu(flags: TransportFlags): NavSubItem[] {
  const items: NavSubItem[] = TRANSPORT_VIEWS.filter((v) => transportViewAllowed(v.key, flags)).map((v) => ({
    key: v.key,
    label: v.label,
    icon: v.icon,
    href: `/transportation?view=${v.key}`,
  }));
  if (flags.outOfTown) {
    items.push({ key: "out-of-town", label: "Out of Town Trip", icon: "Plane", href: "/out-of-town" });
  }
  return items;
}
