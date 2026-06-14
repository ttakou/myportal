import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

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
export async function getAccess(): Promise<Access> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = await getCurrentRole();
  const admin = isAdminRole(role);

  let fns: FunctionalRole[] = [];
  if (user) {
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
}
