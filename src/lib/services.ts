import { createClient } from "@/lib/supabase/server";
import { getMyAllowedSlugs } from "@/lib/access-roles";
import { getAccess } from "@/lib/auth";
import type { ActiveService } from "@/types/database";

/**
 * Fetch the modules the current user may see in the sidebar, ordered.
 *
 * Two gates apply:
 *  1. Tenant subscription — RLS scopes `tenant_services` to the user's tenant;
 *     only `is_active` modules are considered.
 *  2. Per-user access (strict allowlist) — a module is shown only when one of
 *     the user's assigned access roles grants its slug. A user with no roles
 *     sees no modules. The admin console (core) stays available to admins so
 *     they can assign roles.
 */
export async function getActiveServices(): Promise<ActiveService[]> {
  const supabase = createClient();

  const [{ data, error }, allowed, access] = await Promise.all([
    supabase
      .from("tenant_services")
      .select(
        `
        is_active,
        settings,
        services_catalog (
          id, slug, name, description, icon, route_path, is_core, sort_order, created_at
        )
      `,
      )
      .eq("is_active", true),
    getMyAllowedSlugs(),
    getAccess(),
  ]);

  if (error) {
    console.error("Failed to load active services:", error.message);
    return [];
  }

  // The core "Core System & RBAC" module is the admin console (/admin); only
  // HR/system admins can use it.
  const canAdmin = access.isHr || access.isSystemAdmin;

  // Strict allowlist: a user sees a module only when one of their assigned
  // access roles grants its slug. No roles => no modules.
  const allowedSlugs = allowed ?? [];

  return (data ?? [])
    .filter((row) => row.services_catalog)
    .map((row) => {
      // Supabase types the embedded relation as an array; it is 1:1 here.
      const svc = Array.isArray(row.services_catalog)
        ? row.services_catalog[0]
        : row.services_catalog;
      return {
        ...svc,
        tenant_service_settings: (row.settings ?? {}) as Record<string, unknown>,
      } as ActiveService;
    })
    .filter((svc) => (svc.slug === "core" ? canAdmin : allowedSlugs.includes(svc.slug)))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Return just the active service slugs — used by middleware for gating. */
export async function getActiveServiceSlugs(): Promise<string[]> {
  const services = await getActiveServices();
  return services.map((s) => s.slug);
}
