import type { FunctionalRole } from "@/lib/auth";
import type { UserRole } from "@/types/database";

/**
 * Single source of truth for which roles a caller may grant or revoke.
 *
 * Privileged roles confer administrative control — the RBAC engine, module and
 * tenant settings (`system_admin`), people/HR data (`hr_admin`), or
 * admin-equivalent account access (`tenant_admin`/`super_admin`). Only system
 * admins may assign them, so that HR (or anyone below system-admin) can never
 * escalate a user — or themselves — to an administrator. Non-privileged
 * functional roles (canteen, finance, safety, OIM) stay assignable at HR level.
 *
 * Keep this the only place that decides role-assignment authority; every server
 * action that writes a role must defer to it.
 */
export const PRIVILEGED_FUNCTIONAL_ROLES: readonly FunctionalRole[] = [
  "system_admin",
  "hr_admin",
];

/** Account (base) roles that grant admin-equivalent access to the tenant. */
export const PRIVILEGED_ACCOUNT_ROLES: readonly UserRole[] = [
  "super_admin",
  "tenant_admin",
];

export interface RoleActor {
  isSystemAdmin: boolean;
  isHr: boolean;
}

/** Whether `actor` may grant or revoke the given functional role. */
export function canAssignFunctionalRole(actor: RoleActor, role: FunctionalRole): boolean {
  if (PRIVILEGED_FUNCTIONAL_ROLES.includes(role)) return actor.isSystemAdmin;
  return actor.isHr;
}

/** Whether `actor` may set the given account (base) role on a profile. */
export function canAssignAccountRole(actor: RoleActor, role: UserRole): boolean {
  if (PRIVILEGED_ACCOUNT_ROLES.includes(role)) return actor.isSystemAdmin;
  return true;
}
