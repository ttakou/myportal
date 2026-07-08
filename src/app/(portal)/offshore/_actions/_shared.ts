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

/** Offshore trip functionality is managed by admins, the Campboss, or the OIM. */
export async function canManageOffshore(): Promise<boolean> {
  const a = await getAccess();
  return a.isAdmin || a.isCampboss || a.isOim;
}

export async function tenantId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function canManageCatering(): Promise<boolean> {
  const a = await getAccess();
  return a.isAdmin || a.isCampboss || a.isOim || a.isCanteenManager;
}

/**
 * Offshore action guard. The Campboss and OIM (and tenant/system admins) manage
 * everything. Everyone else needs the matching offshore verb granted by one of
 * their access roles.
 */
export async function requireOffshore(verb: Verb): Promise<ActionResult | null> {
  if (await canManageOffshore()) return null; // admin, campboss, or oim
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
