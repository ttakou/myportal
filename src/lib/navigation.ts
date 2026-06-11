/**
 * Single source of truth for module routing.
 *
 * The 9 modules are a fixed, known scope, so their route prefixes are declared
 * statically here. BOTH the Sidebar and the Middleware consume this map:
 *   - The Sidebar uses it to render links for the tenant's ACTIVE modules.
 *   - The Middleware uses it to know which paths are "module-gated" at all,
 *     then checks the requested path against the tenant's active subscriptions.
 *
 * Keep `slug` values in sync with services_catalog.slug in the database.
 */

export type ServiceSlug =
  | "core"
  | "emergency"
  | "canteen"
  | "transportation"
  | "out-of-town"
  | "offshore"
  | "visitors"
  | "medical"
  | "savings"
  | "performance";

export interface ModuleRoute {
  slug: ServiceSlug;
  /** Base route prefix that this module owns. */
  routePath: string;
  /** Core modules are always available and never gated by subscription. */
  isCore: boolean;
}

/**
 * Every module the platform CAN offer. This is the gate list — if a request
 * path starts with one of these prefixes, the tenant must have it active.
 */
export const MODULE_ROUTES: ModuleRoute[] = [
  { slug: "core", routePath: "/admin", isCore: true },
  { slug: "emergency", routePath: "/emergency", isCore: false },
  { slug: "canteen", routePath: "/canteen", isCore: false },
  { slug: "transportation", routePath: "/transportation", isCore: false },
  { slug: "out-of-town", routePath: "/out-of-town", isCore: false },
  { slug: "offshore", routePath: "/offshore", isCore: false },
  { slug: "visitors", routePath: "/visitors", isCore: false },
  { slug: "medical", routePath: "/medical", isCore: false },
  { slug: "savings", routePath: "/savings", isCore: false },
  { slug: "performance", routePath: "/performance", isCore: false },
];

/** Routes available to any authenticated user regardless of subscription. */
export const ALWAYS_ALLOWED_PREFIXES = [
  "/dashboard",
  "/access-denied",
  "/account",
];

/**
 * Given a pathname, return the gated module it belongs to (if any).
 * Matches the longest prefix so "/out-of-town" wins over a shorter sibling.
 */
export function matchModuleRoute(pathname: string): ModuleRoute | null {
  let best: ModuleRoute | null = null;
  for (const route of MODULE_ROUTES) {
    if (pathname === route.routePath || pathname.startsWith(route.routePath + "/")) {
      if (!best || route.routePath.length > best.routePath.length) {
        best = route;
      }
    }
  }
  return best;
}
