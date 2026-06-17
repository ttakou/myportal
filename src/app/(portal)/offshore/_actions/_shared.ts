// Shared internals for the offshore server-action modules. Not "use server":
// these are plain server-side helpers imported by the action modules.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions-server";
import type { Verb } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";

export const rev = () => revalidatePath("/offshore");

export async function admin() {
  return isAdminRole(await getCurrentRole());
}

/** Offshore setup is managed by tenant admins and safety admins. */
export async function canManageOffshore(): Promise<boolean> {
  const a = await getAccess();
  return a.isAdmin || a.isSafetyAdmin;
}

export async function tenantId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  return data?.id ?? null;
}

/** OIM (or admin) approves offshore visit requests. */
export async function canApproveVisits(): Promise<boolean> {
  const a = await getAccess();
  return a.isAdmin || a.isOim;
}

export async function canManageCatering(): Promise<boolean> {
  const a = await getAccess();
  return a.isAdmin || a.isSafetyAdmin || a.isCanteenManager;
}

/**
 * Offshore action guard. Existing power roles keep full access (tenant/system
 * admin and safety admin manage everything; the OIM may approve). Everyone else
 * needs the matching offshore verb granted by one of their access roles.
 */
export async function requireOffshore(verb: Verb): Promise<ActionResult | null> {
  if (await canManageOffshore()) return null; // admin or safety_admin
  if (verb === "approve" && (await canApproveVisits())) return null; // OIM
  return requirePermission("offshore", verb);
}

/** Catering guard for the offshore meal sheet: caterers keep access, else verb. */
export async function requireOffshoreCatering(verb: Verb): Promise<ActionResult | null> {
  if (await canManageCatering()) return null; // admin / safety / canteen_manager
  return requirePermission("offshore", verb);
}

export const VISITOR_TYPES = [
  "employee",
  "contractor",
  "vendor",
  "auditor",
  "regulator",
  "client",
  "management",
];
