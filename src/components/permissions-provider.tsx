"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { hasPermission, type PermissionMap, type Verb } from "@/lib/permissions";

/** The access flags needed to mirror the server-side permission bypasses. */
export interface PermissionAccess {
  isAdmin: boolean;
  isSystemAdmin: boolean;
  isSafetyAdmin: boolean;
  isOim: boolean;
  isCanteenStaff: boolean;
  isCanteenManager: boolean;
  isHr: boolean;
}

interface Ctx {
  perms: PermissionMap;
  access: PermissionAccess;
}

const PermissionsContext = createContext<Ctx | null>(null);

/**
 * Client-side mirror of the server permission checks, used purely to show/hide
 * UI controls (the server remains the security boundary). It errs toward
 * showing — the functional-role bypasses match `requireModule` / `requireOffshore`
 * / `requireOffshoreCatering` so we never hide a control a user can actually use.
 */
function canDo(perms: PermissionMap, access: PermissionAccess, module: string, verb: Verb): boolean {
  if (access.isAdmin || access.isSystemAdmin) return true;

  // Module-specific functional-role bypasses (kept in sync with the server).
  if (module === "offshore") {
    if (access.isSafetyAdmin) return true;
    if (verb === "approve" && access.isOim) return true;
  }
  if (module === "canteen") {
    if (verb === "operate" && access.isCanteenStaff) return true;
    if (access.isCanteenManager && (verb === "manage" || verb === "edit" || verb === "approve"))
      return true;
    if (verb === "manage" && access.isHr) return true;
  }
  if (module === "emergency") {
    if (access.isSafetyAdmin && (verb === "manage" || verb === "approve")) return true;
  }

  return hasPermission(perms, module, verb);
}

export function PermissionsProvider({
  perms,
  access,
  children,
}: {
  perms: PermissionMap;
  access: PermissionAccess;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ perms, access }), [perms, access]);
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

/**
 * `const { can } = usePermissions();` then `can("offshore", "manage")`.
 * Defaults to permissive (true) outside a provider, so it never accidentally
 * hides controls where the context isn't mounted.
 */
export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  return {
    can: (module: string, verb: Verb): boolean =>
      ctx ? canDo(ctx.perms, ctx.access, module, verb) : true,
  };
}
