// Single source of truth for the canteen module's sidebar submenu. The canteen
// sub-areas are real routes (not `?view=` views), so each item carries a full
// href and the sidebar matches the active one by pathname. Related routes are
// consolidated into a handful of "hubs"; a hub's member routes render as a tab
// bar (see canteen-tabs.tsx + the /canteen layout), and the sidebar entry stays
// highlighted on any of the hub's routes via `matchPaths`.

export interface CanteenNavItem {
  key: string;
  label: string;
  icon: string; // lucide-react name (PascalCase)
  href: string;
  /** Extra pathnames that keep this entry highlighted (the hub's routes). */
  matchPaths?: string[];
}

/** The role flags that decide which canteen areas a user can see. */
export interface CanteenAccess {
  canServe: boolean;
  canManage: boolean;
  canEntitle: boolean;
  canReport: boolean;
  isOim: boolean;
  isHrCanteen: boolean;
}

interface CanteenTab {
  label: string;
  href: string;
  gate: (o: CanteenAccess) => boolean;
}
interface CanteenHub {
  key: string;
  label: string;
  icon: string;
  tabs: CanteenTab[];
}

const ALL = () => true;

/** The consolidated hubs (13 flat items → 5 sidebar entries). */
const CANTEEN_HUBS: CanteenHub[] = [
  {
    key: "my", label: "My Canteen", icon: "UtensilsCrossed",
    tabs: [
      { label: "Today's menu", href: "/canteen", gate: ALL },
      { label: "Lunch history", href: "/canteen/history", gate: ALL },
      { label: "My meals", href: "/reports/my-meals", gate: ALL },
      { label: "Feedback", href: "/canteen/feedback", gate: ALL },
    ],
  },
  {
    key: "serving", label: "Serving", icon: "ScanLine",
    tabs: [
      { label: "Serving point", href: "/canteen/serving", gate: (o) => o.canServe },
      { label: "Meal serving", href: "/canteen/redeem", gate: (o) => o.canServe },
    ],
  },
  {
    key: "management", label: "Management", icon: "Settings",
    tabs: [
      { label: "Manage menu", href: "/canteen/manage", gate: (o) => o.canManage },
      { label: "Campboss dashboard", href: "/canteen/campboss", gate: (o) => o.canManage },
      { label: "Forecast", href: "/canteen/forecast", gate: (o) => o.canManage || o.isHrCanteen },
    ],
  },
  {
    key: "entitlements", label: "Entitlements", icon: "Users",
    tabs: [{ label: "Entitlements", href: "/canteen/entitlements", gate: (o) => o.canEntitle }],
  },
  {
    key: "reports", label: "Reports", icon: "BarChart3",
    tabs: [
      { label: "Canteen reports", href: "/canteen/reports", gate: (o) => o.canReport || o.isHrCanteen },
      { label: "Consumption", href: "/reports/canteen", gate: (o) => o.canReport || o.isOim || o.isHrCanteen },
      { label: "Feedback report", href: "/reports/canteen-feedback", gate: (o) => o.canEntitle || o.canManage || o.isHrCanteen },
    ],
  },
];

/**
 * Consolidated sidebar submenu: one entry per hub the user can see, landing on
 * its first permitted route and highlighted across all of them.
 */
export function canteenSubmenu(opts: CanteenAccess): CanteenNavItem[] {
  const items: CanteenNavItem[] = [];
  for (const hub of CANTEEN_HUBS) {
    const permitted = hub.tabs.filter((t) => t.gate(opts));
    if (permitted.length === 0) continue;
    items.push({
      key: hub.key,
      label: hub.label,
      icon: hub.icon,
      href: permitted[0].href,
      matchPaths: permitted.map((t) => t.href),
    });
  }
  return items;
}

/**
 * The tab bar for whichever hub owns `pathname` — permitted routes only. Returns
 * [] (no bar) when the current path isn't in a hub, or the hub has <2 tabs.
 */
export function canteenTabsFor(
  pathname: string,
  opts: CanteenAccess,
): { label: string; href: string }[] {
  const hub = CANTEEN_HUBS.find((h) => h.tabs.some((t) => t.href === pathname));
  if (!hub) return [];
  const permitted = hub.tabs.filter((t) => t.gate(opts));
  if (permitted.length < 2) return [];
  return permitted.map((t) => ({ label: t.label, href: t.href }));
}
