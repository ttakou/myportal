import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleStates } from "@/lib/notification-modules";

/**
 * Each tenant's modules as the notification pipeline sees them: on or off,
 * and whether their email switch is on. The core admin module is left out;
 * it is never held back. Read on the service-role client.
 */
export async function loadModuleStates(admin: SupabaseClient, tenantIds: string[]): Promise<Map<string, ModuleStates>> {
  const out = new Map<string, ModuleStates>();
  if (tenantIds.length === 0) return out;
  const { data } = await admin
    .from("tenant_services")
    .select("tenant_id, is_active, settings, services_catalog!inner(slug, route_path, is_core)")
    .in("tenant_id", tenantIds);
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const cat = (Array.isArray(row.services_catalog) ? row.services_catalog[0] : row.services_catalog) as
      | { slug?: string; route_path?: string; is_core?: boolean }
      | null;
    if (!cat?.slug || !cat.route_path || cat.is_core) continue;
    const seg = cat.route_path.replace(/^\//, "").split("/")[0];
    if (!seg) continue;
    const settings = (row.settings ?? {}) as Record<string, unknown>;
    const states = out.get(row.tenant_id as string) ?? new Map();
    states.set(seg, { slug: cat.slug, active: row.is_active === true, email: settings.email_notifications !== false });
    out.set(row.tenant_id as string, states);
  }
  return out;
}
