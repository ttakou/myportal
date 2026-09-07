// What each management view needs loaded before it can render.
//
// The page used to fetch all twenty-one datasets for every management view,
// so opening "Installations" paid for the POB breakdown, the rotation
// calendar and the muster archive it never showed. This map is the single
// statement of who needs what; the page loads exactly these and passes empty
// values for the rest, and the management component renders one view from
// them.

import {
  firstOffshoreManagementView,
  offshoreViewPerm,
  resolveManagementView,
  type OffshoreRoleFlags,
  type OffshoreViewKey,
} from "./offshore-views";

export type ManagementDataKey =
  | "crews"
  | "rooms"
  | "roster"
  | "addable"
  | "pob"
  | "accommodation"
  | "certAlerts"
  | "visits"
  | "manifests"
  | "manageInstallations"
  | "calendar"
  | "employees"
  | "suggestions"
  | "emergencyRoles"
  | "emergencyTeams"
  | "musterGroups"
  | "musterDrill"
  | "musterDrillHistory"
  | "trips"
  | "flights"
  | "defaultMode";

export const VIEW_DATA: Record<OffshoreViewKey, readonly ManagementDataKey[]> = {
  // Self-service and "Where is…" load their own data on the page.
  mytrips: [],
  whereis: [],
  dashboard: [
    "pob",
    "accommodation",
    "certAlerts",
    "crews",
    "rooms",
    "roster",
    "visits",
    "trips",
    // The crew-change suggestions and the tenant's default mode sit above
    // the overview on the page.
    "suggestions",
    "defaultMode",
  ],
  board: ["pob", "emergencyRoles", "emergencyTeams", "musterGroups"],
  installations: ["manageInstallations"],
  crews: ["crews", "suggestions", "roster", "pob"],
  calendar: ["calendar", "crews"],
  attendance: [],
  rooms: ["rooms", "roster", "employees", "pob"],
  bedboard: ["rooms", "pob", "roster", "employees"],
  roster: ["roster", "crews", "rooms", "addable"],
  register: ["roster", "addable", "pob"],
  visitors: ["visits"],
  manifests: ["manifests", "crews", "roster", "employees", "pob", "visits"],
  trips: ["trips", "flights"],
  assign: ["employees", "crews"],
  catering: [],
  emergency: ["emergencyRoles", "emergencyTeams", "musterGroups", "roster"],
  drill: ["musterDrill", "musterDrillHistory", "emergencyTeams"],
  history: [],
  "staff-history": [],
};

/**
 * The management view that will actually render for a raw `?view=` value:
 * an unknown value lands on the dashboard, and a view the role may not open
 * falls back to the first one it may. Both the page (to load data) and the
 * management component (to render) go through this, so they cannot disagree.
 */
export function effectiveManagementView(
  raw: string | null | undefined,
  flags: OffshoreRoleFlags,
): OffshoreViewKey {
  const requested = resolveManagementView(raw);
  return offshoreViewPerm(requested, flags) !== "none"
    ? requested
    : firstOffshoreManagementView(flags);
}

/** The datasets one view needs, as a set for cheap membership checks. */
export function managementDataFor(view: OffshoreViewKey): ReadonlySet<ManagementDataKey> {
  return new Set(VIEW_DATA[view] ?? []);
}
