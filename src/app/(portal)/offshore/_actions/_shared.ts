// Shared internals for the offshore server-action modules. Not "use server":
// these are plain server-side helpers imported by the action modules.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess, getCurrentRole, isAdminRole } from "@/lib/auth";

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

export const VISITOR_TYPES = [
  "employee",
  "contractor",
  "vendor",
  "auditor",
  "regulator",
  "client",
  "management",
];
