import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withDefaults, type ModuleSettings } from "@/lib/module-params";

/** Settings for one module of the current user's tenant (RLS-scoped). */
export async function getModuleSettings(slug: string): Promise<ModuleSettings> {
  const supabase = createClient();
  const { data } = await supabase
    .from("tenant_services")
    .select("settings, services_catalog!inner(slug)")
    .eq("services_catalog.slug", slug)
    .maybeSingle();
  return withDefaults(slug, data?.settings);
}

/** Same, for trusted background jobs that act across tenants (service role). */
export async function getModuleSettingsForTenant(
  admin: SupabaseClient,
  tenantId: string,
  slug: string,
): Promise<ModuleSettings> {
  const { data } = await admin
    .from("tenant_services")
    .select("settings, services_catalog!inner(slug)")
    .eq("tenant_id", tenantId)
    .eq("services_catalog.slug", slug)
    .maybeSingle();
  return withDefaults(slug, data?.settings);
}
