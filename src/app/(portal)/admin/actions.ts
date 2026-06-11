"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole, isAdminRole } from "@/lib/auth";
import type { UserRole } from "@/types/database";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const ASSIGNABLE_ROLES: UserRole[] = ["employee", "manager", "tenant_admin"];

async function requireAdmin(): Promise<ActionResult | null> {
  const role = await getCurrentRole();
  if (!isAdminRole(role)) return { ok: false, error: "Not authorized." };
  return null;
}

export async function setUserRole(
  userId: string,
  role: UserRole,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return { ok: false, error: "Invalid role." };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function setUserManager(
  userId: string,
  managerId: string | null,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (managerId === userId) {
    return { ok: false, error: "A user cannot manage themselves." };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ manager_id: managerId })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function setUserDepartment(
  userId: string,
  department: string,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ department: department.trim() || null })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function setUserLunchEligible(
  userId: string,
  eligible: boolean,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ lunch_eligible: eligible })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function setUserType(
  userId: string,
  employeeType: "employee" | "contractor" | "guest",
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ employee_type: employeeType })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function setUserActive(
  userId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Set which meal periods the canteen serves (stored in tenant_services.settings). */
export async function setCanteenMealPeriods(
  mealPeriods: string[],
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const allowed = ["breakfast", "lunch", "dinner"];
  const clean = allowed.filter((m) => mealPeriods.includes(m)); // keep canonical order
  if (clean.length === 0) {
    return { ok: false, error: "Select at least one meal period." };
  }

  const supabase = createClient();
  const { data: row } = await supabase
    .from("tenant_services")
    .select("id, settings, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "canteen")
    .maybeSingle();
  if (!row) return { ok: false, error: "Canteen module is not enabled." };

  const settings = {
    ...((row.settings as Record<string, unknown>) ?? {}),
    meal_periods: clean,
  };
  const { error } = await supabase
    .from("tenant_services")
    .update({ settings })
    .eq("id", row.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/canteen");
  revalidatePath("/canteen/manage");
  revalidatePath("/canteen/campboss");
  return { ok: true };
}

/** Enable/disable a module for the current tenant (upsert tenant_services). */
export async function setModuleActive(
  serviceId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = createClient();
  // Resolve the caller's tenant (RLS returns only their tenant).
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { error } = await supabase.from("tenant_services").upsert(
    { tenant_id: tenant.id, service_id: serviceId, is_active: isActive },
    { onConflict: "tenant_id,service_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/", "layout"); // sidebar reflects the change
  return { ok: true };
}
