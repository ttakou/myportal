import { createClient } from "@/lib/supabase/server";
import { getMyAllowedSlugs } from "@/lib/access-roles";
import type { ActiveService } from "@/types/database";

/**
 * Fetch the modules the current user's tenant has switched on, ordered for the
 * sidebar. RLS scopes `tenant_services` to the user's tenant automatically, so
 * no explicit tenant filter is needed here — the database guarantees isolation.
 *
 * When the user has access roles assigned, the list is further narrowed to the
 * modules those roles grant (core modules are never filtered out).
 */
export async function getActiveServices(): Promise<ActiveService[]> {
  const supabase = createClient();

  const [{ data, error }, allowed] = await Promise.all([
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
  ]);

  if (error) {
    console.error("Failed to load active services:", error.message);
    return [];
  }

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
    .filter((svc) => allowed === null || svc.is_core || allowed.includes(svc.slug))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Return just the active service slugs — used by middleware for gating. */
export async function getActiveServiceSlugs(): Promise<string[]> {
  const services = await getActiveServices();
  return services.map((s) => s.slug);
}
