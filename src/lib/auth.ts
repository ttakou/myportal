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
  | "hr_canteen"
  | "hr_admin"
  | "finance"
  | "safety_admin"
  | "campboss"
  | "oim"
  | "dispatcher"
  | "pgm"
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
  /** HR Canteen — owns canteen entitlement + full consumption/feedback oversight. */
  isHrCanteen: boolean;
  isHr: boolean;
  isFinance: boolean;
  isSafetyAdmin: boolean;
  /** Offshore Campboss — runs the offshore camp / trip functionality. */
  isCampboss: boolean;
  /** Offshore Installation Manager — approves offshore visit requests. */
  isOim: boolean;
  /**
   * Offshore Dispatcher — runs crew rotations, travel/manifests and the
   * offshore-staff roster (full), with read-only POB & accommodation.
   */
  isDispatcher: boolean;
  /** Records the final rating at Final Appraisal — the PGM, or an HR admin. */
  isPgm: boolean;
}

/** Resolve the current user's base role + functional roles into capability flags. */
export const getAccess = cache(async (): Promise<Access> => {
  const [user, role] = await Promise.all([getCachedUser(), getCurrentRole()]);
  const admin = isAdminRole(role);

  let fns: FunctionalRole[] = [];
  if (user) {
    const supabase = createClient();
    // Include functional roles held via an active delegation — but never the
    // privileged admin roles, which are not delegable (mirrors uid_has_role).
    const { getActiveDelegatorIds } = await import("@/lib/delegation");
    const delegatorIds = await getActiveDelegatorIds();
    const { data } = await supabase
      .from("profile_roles")
      .select("profile_id, role")
      .in("profile_id", [user.id, ...delegatorIds]);
    const PRIVILEGED = new Set<string>(["system_admin", "hr_admin"]);
    fns = (data ?? [])
      .filter((r) => r.profile_id === user.id || !PRIVILEGED.has(r.role as string))
      .map((r) => r.role as FunctionalRole);
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
    isHrCanteen: isSystemAdmin || has("hr_canteen"),
    isHr: isSystemAdmin || has("hr_admin"),
    isFinance: isSystemAdmin || has("finance"),
    isSafetyAdmin: isSystemAdmin || has("safety_admin"),
    isCampboss: isSystemAdmin || has("campboss"),
    isOim: isSystemAdmin || has("oim"),
    isDispatcher: isSystemAdmin || has("dispatcher"),
    // The PGM records the final rating. HR admins may record it too, so they
    // count as holding the role rather than having to proxy for somebody.
    isPgm: isSystemAdmin || has("pgm") || has("hr_admin"),
  };
});
