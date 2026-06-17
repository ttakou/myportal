import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

/**
 * Request-scoped current user. `getUser()` verifies the JWT against Supabase
 * Auth over the network, so calling it once per helper (layout, access, role,
 * permissions, notifications) meant ~5 round-trips per page load. React `cache`
 * memoizes this for the lifetime of a single server request/action, collapsing
 * them into one verification.
 */
export const getCachedUser = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export type FunctionalRole =
  | "canteen_staff"
  | "canteen_manager"
  | "hr_admin"
  | "finance"
  | "safety_admin"
  | "oim"
  | "system_admin";

/**
 * Resolve the current user's base role. Prefers the JWT claim (set by the access
 * token hook) and falls back to the profiles table so it works without the hook.
 */
export const getCurrentRole = cache(async (): Promise<UserRole | null> => {
  const user = await getCachedUser();
  if (!user) return null;

  const claimRole = (user.app_metadata as { user_role?: UserRole })?.user_role;
  if (claimRole) return claimRole;

  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return (data?.role as UserRole) ?? null;
});

export function isAdminRole(role: UserRole | null): boolean {
  return role === "super_admin" || role === "tenant_admin";
}

export interface Access {
  role: UserRole | null;
  isAdmin: boolean;
  isSystemAdmin: boolean;
  isCanteenManager: boolean;
  isCanteenStaff: boolean;
  isHr: boolean;
  isFinance: boolean;
  isSafetyAdmin: boolean;
  /** Offshore Installation Manager — approves offshore visit requests. */
  isOim: boolean;
}

/** Resolve the current user's base role + functional roles into capability flags. */
export const getAccess = cache(async (): Promise<Access> => {
  const [user, role] = await Promise.all([getCachedUser(), getCurrentRole()]);
  const admin = isAdminRole(role);

  let fns: FunctionalRole[] = [];
  if (user) {
    const supabase = createClient();
    const { data } = await supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", user.id);
    fns = (data ?? []).map((r) => r.role as FunctionalRole);
  }
  const has = (r: FunctionalRole) => fns.includes(r);
  const isSystemAdmin = admin || has("system_admin");
  const isCanteenManager = isSystemAdmin || has("canteen_manager");
  return {
    role,
    isAdmin: admin,
    isSystemAdmin,
    isCanteenManager,
    isCanteenStaff: isCanteenManager || has("canteen_staff"),
    isHr: isSystemAdmin || has("hr_admin"),
    isFinance: isSystemAdmin || has("finance"),
    isSafetyAdmin: isSystemAdmin || has("safety_admin"),
    isOim: isSystemAdmin || has("oim"),
  };
});
