"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAccess, type FunctionalRole } from "@/lib/auth";
import { MODULE_PARAMS } from "@/lib/module-params";
import { MODULE_ROUTES } from "@/lib/navigation";
import type { UserRole } from "@/types/database";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const ASSIGNABLE_ROLES: UserRole[] = ["employee", "manager", "tenant_admin"];
const ASSIGNABLE_FUNCTIONAL: FunctionalRole[] = [
  "canteen_staff",
  "canteen_manager",
  "hr_admin",
  "finance",
  "safety_admin",
  "system_admin",
];

/** System-admin level (roles, modules, settings). */
async function requireAdmin(): Promise<ActionResult | null> {
  if (!(await getAccess()).isSystemAdmin) return { ok: false, error: "Not authorized." };
  return null;
}

/** HR level (manage people). */
async function requireHr(): Promise<ActionResult | null> {
  if (!(await getAccess()).isHr) return { ok: false, error: "Not authorized." };
  return null;
}

export async function addUserRole(userId: string, role: FunctionalRole): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  if (!ASSIGNABLE_FUNCTIONAL.includes(role)) return { ok: false, error: "Invalid role." };
  const supabase = createClient();
  const { error } = await supabase.from("profile_roles").insert({ profile_id: userId, role });
  if (error && !error.message.includes("duplicate")) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

export async function removeUserRole(userId: string, role: FunctionalRole): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  const supabase = createClient();
  const { error } = await supabase
    .from("profile_roles")
    .delete()
    .eq("profile_id", userId)
    .eq("role", role);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
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
  const denied = await requireHr();
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
  const denied = await requireHr();
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
  const denied = await requireHr();
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
  const denied = await requireHr();
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
  const denied = await requireHr();
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
  if (!(await getAccess()).isCanteenManager) return { ok: false, error: "Not authorized." };

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

/** Set the same-day booking cutoff hour (0-23) or clear it (null). */
export async function setCanteenCutoff(hour: number | null): Promise<ActionResult> {
  if (!(await getAccess()).isCanteenManager) return { ok: false, error: "Not authorized." };
  const clean =
    hour === null || Number.isNaN(hour) ? null : Math.max(0, Math.min(23, Math.floor(hour)));
  const supabase = createClient();
  const { data: row } = await supabase
    .from("tenant_services")
    .select("id, settings, services_catalog!inner(slug)")
    .eq("services_catalog.slug", "canteen")
    .maybeSingle();
  if (!row) return { ok: false, error: "Canteen module is not enabled." };
  const settings = { ...((row.settings as Record<string, unknown>) ?? {}), cutoff_hour: clean };
  const { error } = await supabase.from("tenant_services").update({ settings }).eq("id", row.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/canteen");
  return { ok: true };
}

// --- Access roles (role-based module access) ---------------------------------

const ASSIGNABLE_MODULE_SLUGS = MODULE_ROUTES.filter((m) => !m.isCore).map((m) => m.slug);

function cleanModuleSlugs(slugs: string[]): string[] {
  return [...new Set(slugs)].filter((s) =>
    (ASSIGNABLE_MODULE_SLUGS as string[]).includes(s),
  );
}

/** Create a named access role granting a set of modules. */
export async function createAccessRole(input: {
  name: string;
  description?: string;
  moduleSlugs: string[];
}): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!input.name.trim()) return { ok: false, error: "Role name is required." };

  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { error } = await supabase.from("tenant_roles").insert({
    tenant_id: tenant.id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    module_slugs: cleanModuleSlugs(input.moduleSlugs),
  });
  if (error)
    return {
      ok: false,
      error: error.message.includes("duplicate")
        ? "A role with that name already exists."
        : error.message,
    };
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateAccessRole(input: {
  id: string;
  name?: string;
  description?: string;
  moduleSlugs?: string[];
}): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    if (!input.name.trim()) return { ok: false, error: "Role name is required." };
    patch.name = input.name.trim();
  }
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (input.moduleSlugs !== undefined) patch.module_slugs = cleanModuleSlugs(input.moduleSlugs);

  const supabase = createClient();
  const { error } = await supabase.from("tenant_roles").update(patch).eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Delete a role; assignments cascade, affected users fall back to unrestricted-or-other-roles. */
export async function deleteAccessRole(id: string): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = createClient();
  const { error } = await supabase.from("tenant_roles").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  return { ok: true };
}

/** Assign or remove an access role for a user. */
export async function setUserAccessRole(
  userId: string,
  roleId: string,
  assigned: boolean,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = createClient();

  if (assigned) {
    const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    if (!tenant) return { ok: false, error: "No tenant in scope." };
    const { error } = await supabase.from("profile_access_roles").insert({
      profile_id: userId,
      role_id: roleId,
      tenant_id: tenant.id,
    });
    if (error && !error.message.includes("duplicate")) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("profile_access_roles")
      .delete()
      .eq("profile_id", userId)
      .eq("role_id", roleId);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Save a module's parameters (validated against the registry) into
 * tenant_services.settings, merging over whatever is already stored.
 */
export async function updateModuleSettings(
  serviceId: string,
  slug: string,
  values: Record<string, boolean | number | string>,
): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const defs = MODULE_PARAMS[slug] ?? [];
  const valid: Record<string, boolean | number | string> = {};
  for (const def of defs) {
    if (!(def.key in values)) continue;
    const v = values[def.key];
    if (def.type === "boolean" && typeof v !== "boolean")
      return { ok: false, error: `${def.label} must be on or off.` };
    if (def.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) return { ok: false, error: `${def.label} must be a number.` };
      if (def.min !== undefined && n < def.min)
        return { ok: false, error: `${def.label} must be ≥ ${def.min}.` };
      if (def.max !== undefined && n > def.max)
        return { ok: false, error: `${def.label} must be ≤ ${def.max}.` };
      valid[def.key] = n;
      continue;
    }
    if (def.type === "select" && !def.options?.some((o) => o.value === v))
      return { ok: false, error: `${def.label}: invalid choice.` };
    valid[def.key] = v;
  }

  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const { data: existing } = await supabase
    .from("tenant_services")
    .select("settings, is_active")
    .eq("service_id", serviceId)
    .maybeSingle();

  const merged = { ...((existing?.settings as object) ?? {}), ...valid };
  const { error } = await supabase.from("tenant_services").upsert(
    {
      tenant_id: tenant.id,
      service_id: serviceId,
      is_active: existing?.is_active ?? true,
      settings: merged,
    },
    { onConflict: "tenant_id,service_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
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
