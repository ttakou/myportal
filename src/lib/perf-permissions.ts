import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/auth";
import {
  cleanMatrix,
  canCapability,
  resolvePermRoles,
  DEFAULT_PERMISSION_MATRIX,
  type AppraisalRelationship,
  type PermCapability,
  type PermissionMatrix,
  type PermRole,
} from "@/types/perf-permissions";

export type { AppraisalRelationship };
export { resolvePermRoles };

/** The tenant's permission matrix, or the built-in defaults if none is saved. */
export const getPermissionMatrix = cache(async (): Promise<PermissionMatrix> => {
  const supabase = createClient();
  const { data } = await supabase
    .from("performance_permission_settings")
    .select("matrix")
    .limit(1)
    .maybeSingle();
  if (!data) return DEFAULT_PERMISSION_MATRIX;
  return cleanMatrix((data as { matrix?: unknown }).matrix);
});

/**
 * Resolve a user's effective capabilities for an appraisal: load the matrix,
 * work out which roles they hold, and expose a `can()` helper.
 */
export async function getAppraisalCapabilities(rel: AppraisalRelationship): Promise<{
  roles: PermRole[];
  can: (cap: PermCapability) => boolean;
}> {
  const [matrix, access] = await Promise.all([getPermissionMatrix(), getAccess()]);
  const roles = resolvePermRoles(access, rel);
  return { roles, can: (cap) => canCapability(matrix, roles, cap) };
}
