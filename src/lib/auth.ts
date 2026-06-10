import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

/**
 * Resolve the current user's role. Prefers the JWT claim (set by the access
 * token hook) and falls back to the profiles table so it still works before the
 * hook is enabled.
 */
export async function getCurrentRole(): Promise<UserRole | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const claimRole = (user.app_metadata as { user_role?: UserRole })?.user_role;
  if (claimRole) return claimRole;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return (data?.role as UserRole) ?? null;
}

export function isAdminRole(role: UserRole | null): boolean {
  return role === "super_admin" || role === "tenant_admin";
}
