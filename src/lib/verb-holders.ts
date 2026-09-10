import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The active people whose access role grants one of `verbs` on a module,
 * for a tenant. When nobody does (a tenant that has not set roles up),
 * every tenant admin — a notification must always have someone to land on.
 */
export async function holdersOfVerb(client: SupabaseClient, tenantId: string, module: string, verbs: string[]): Promise<string[]> {
  const { data: roles } = await client.from("tenant_roles").select("id, permissions").eq("tenant_id", tenantId);
  const roleIds = ((roles ?? []) as { id: string; permissions: Record<string, string[]> | null }[])
    .filter((r) => (r.permissions?.[module] ?? []).some((v) => verbs.includes(v)))
    .map((r) => r.id);

  if (roleIds.length > 0) {
    const { data: holders } = await client
      .from("profile_access_roles")
      .select("profile_id, profiles!inner(is_active, tenant_id)")
      .in("role_id", roleIds)
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
