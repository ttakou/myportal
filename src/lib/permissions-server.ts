import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAccess, type Access } from "@/lib/auth";
import type { ActionResult } from "@/types/actions";
import { hasPermission, type PermissionMap, type Verb } from "@/lib/permissions";

/**
 * Effective permissions for the signed-in user — the union of the verb grants
 * across every access role assigned to them.
 */
export async function getMyPermissions(): Promise<PermissionMap> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data } = await supabase
    .from("profile_access_roles")
    .select("tenant_roles(permissions)")
    .eq("profile_id", user.id);

  const acc: Record<string, Set<Verb>> = {};
  for (const row of (data ?? []) as Record<string, any>[]) {
    const role = Array.isArray(row.tenant_roles) ? row.tenant_roles[0] : row.tenant_roles;
    const perms = (role?.permissions ?? {}) as Record<string, string[]>;
    for (const [slug, verbs] of Object.entries(perms)) {
      (acc[slug] ??= new Set<Verb>());
      for (const v of verbs ?? []) acc[slug].add(v as Verb);
    }
  }
  const out: PermissionMap = {};
  for (const [slug, set] of Object.entries(acc)) out[slug] = [...set];
  return out;
}

/**
 * Server-action guard: returns a denial ActionResult when the signed-in user
 * lacks `verb` on `module`, else null. Tenant/system admins bypass (they manage
 * the roles, so they always have full access).
 */
export async function requirePermission(
  module: string,
  verb: Verb,
): Promise<ActionResult | null> {
  return requireModule(module, verb);
}

/**
 * Like requirePermission, but also lets an existing functional role bypass the
 * check (e.g. canteen staff keep serving regardless of access-role grants).
 */
export async function requireModule(
  module: string,
  verb: Verb,
  bypass?: (a: Access) => boolean,
): Promise<ActionResult | null> {
  const access = await getAccess();
  if (access.isAdmin || access.isSystemAdmin) return null;
  if (bypass && bypass(access)) return null;
  if (hasPermission(await getMyPermissions(), module, verb)) return null;
  return { ok: false, error: "You don't have permission to do this." };
}
