import { createClient } from "@/lib/supabase/server";

/**
 * Role-based module access.
 *
 * An access role is a named bundle of module slugs. A user with no roles is
 * unrestricted (sees everything the tenant has active); a user with roles is
 * limited to the union of their roles' modules. Enforced by the sidebar
 * (lib/services.ts) and the middleware.
 */

export interface AccessRole {
  id: string;
  name: string;
  description: string | null;
  module_slugs: string[];
  member_count: number;
}

/** All role definitions for the tenant, with member counts (admin view). */
export async function getAccessRoles(): Promise<AccessRole[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tenant_roles")
    .select("id, name, description, module_slugs, profile_access_roles(count)")
    .order("name");
  if (error) {
    console.error("getAccessRoles:", error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, any>) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    module_slugs: r.module_slugs ?? [],
    member_count: r.profile_access_roles?.[0]?.count ?? 0,
  }));
}

/**
 * Module slugs the signed-in user may access, or null when unrestricted
 * (no access roles assigned).
 */
export async function getMyAllowedSlugs(): Promise<string[] | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("profile_access_roles")
    .select("tenant_roles(module_slugs)")
    .eq("profile_id", user.id);
  if (error || !data || data.length === 0) return null;

  const slugs = new Set<string>();
  for (const row of data) {
    const role = Array.isArray(row.tenant_roles) ? row.tenant_roles[0] : row.tenant_roles;
    for (const s of (role?.module_slugs as string[]) ?? []) slugs.add(s);
  }
  return [...slugs];
}
