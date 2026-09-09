import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who the dispatch desk is: the active people whose access role grants the
 * transportation `approve` or `manage` verb. When nobody holds either (a
 * tenant that has not set roles up), every tenant admin, as before — a
 * notification must always have someone to land on.
 */
export async function deskIdsFor(client: SupabaseClient, tenantId: string): Promise<string[]> {
  const { data: roles } = await client.from("tenant_roles").select("id, permissions").eq("tenant_id", tenantId);
  const deskRoles = ((roles ?? []) as { id: string; permissions: Record<string, string[]> | null }[])
    .filter((r) => {
      const verbs = r.permissions?.transportation ?? [];
      return verbs.includes("approve") || verbs.includes("manage");
    })
    .map((r) => r.id);

  if (deskRoles.length > 0) {
    const { data: holders } = await client
      .from("profile_access_roles")
      .select("profile_id, profiles!inner(is_active, tenant_id)")
      .in("role_id", deskRoles)
      .eq("profiles.is_active", true)
      .eq("profiles.tenant_id", tenantId);
    const ids = [...new Set((holders ?? []).map((h) => h.profile_id as string))];
    if (ids.length > 0) return ids;
  }

  const { data: admins } = await client
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .in("role", ["tenant_admin", "super_admin"]);
  return (admins ?? []).map((p) => p.id as string);
}
