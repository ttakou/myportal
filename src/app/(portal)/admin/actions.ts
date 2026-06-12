"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccess, type FunctionalRole } from "@/lib/auth";
import { MODULE_PARAMS } from "@/lib/module-params";
import { MODULE_ROUTES } from "@/lib/navigation";
import type { EmployeeType } from "@/lib/admin";
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

// --- Staff registration -------------------------------------------------------

function generateTempPassword(): string {
  // 14 chars, unambiguous alphabet, guaranteed digit + upper + lower.
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(14);
  let pw = "";
  for (const b of bytes) pw += alphabet[b % alphabet.length];
  return pw.slice(0, 5) + "A" + pw.slice(5, 9) + "7" + pw.slice(9, 12) + "x";
}

export interface RegisterStaffResult extends ActionResult {
  /** Returned once when mode = "password"; the admin shares it with the hire. */
  tempPassword?: string;
}

/**
 * Set (or reset) a user's password. HR/system admin only; runs on the
 * service-role client. If no password is supplied, a strong one is generated
 * and returned once so the admin can share it.
 */
export async function setUserPassword(
  userId: string,
  password?: string,
): Promise<RegisterStaffResult> {
  const denied = await requireHr();
  if (denied) return denied;

  const pw = password?.trim() ? password.trim() : generateTempPassword();
  if (pw.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const supabase = createClient();
  // Stay within the caller's tenant — never touch users elsewhere.
  const { data: target } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { ok: false, error: "User not found in your organisation." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Server is missing the service-role key." };
  const { error } = await admin.auth.admin.updateUserById(userId, { password: pw });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  // Only echo the password back when we generated it.
  return { ok: true, tempPassword: password?.trim() ? undefined : pw };
}

/**
 * Register a new staff member end-to-end: create the auth account (invitation
 * email or temporary password), attach the profile to the caller's tenant, and
 * pre-assign role, manager, department and access/functional roles — no
 * Supabase dashboard required.
 *
 * Caller must be HR/system admin; the privileged steps run on the service-role
 * client, with every input validated against the caller's tenant first.
 */
export async function registerStaff(input: {
  fullName: string;
  email: string;
  mode: "invite" | "password";
  role?: UserRole;
  managerId?: string;
  department?: string;
  employeeType?: EmployeeType;
  lunchEligible?: boolean;
  functionalRoles?: FunctionalRole[];
  accessRoleIds?: string[];
}): Promise<RegisterStaffResult> {
  const denied = await requireHr();
  if (denied) return denied;

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  if (!fullName) return { ok: false, error: "Full name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email." };
  const role: UserRole = input.role && ASSIGNABLE_ROLES.includes(input.role) ? input.role : "employee";

  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Server is missing the service-role key." };

  // Validate the manager and access roles belong to this tenant before using
  // the service-role client to write them.
  if (input.managerId) {
    const { data: mgr } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", input.managerId)
      .maybeSingle();
    if (!mgr) return { ok: false, error: "Manager not found in your organisation." };
  }
  let accessRoleIds: string[] = [];
  if (input.accessRoleIds?.length) {
    const { data: roles } = await supabase
      .from("tenant_roles")
      .select("id")
      .in("id", input.accessRoleIds);
    accessRoleIds = (roles ?? []).map((r) => r.id as string);
  }

  // 1. Create the auth account. The handle_new_user trigger creates a pending
  //    profile alongside it.
  let userId: string;
  let tempPassword: string | undefined;
  if (input.mode === "invite") {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
    });
    if (error) {
      return {
        ok: false,
        error: error.message.includes("already")
          ? "An account with that email already exists."
          : `Could not send invitation: ${error.message}`,
      };
    }
    userId = data.user.id;
  } else {
    tempPassword = generateTempPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) {
      return {
        ok: false,
        error: error.message.includes("already")
          ? "An account with that email already exists."
          : error.message,
      };
    }
    userId = data.user.id;
  }

  // 2. Attach the profile to the tenant with the chosen attributes.
  const employeeType: EmployeeType =
    input.employeeType && ["employee", "contractor", "guest"].includes(input.employeeType)
      ? input.employeeType
      : "employee";
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      tenant_id: tenant.id,
      role,
      manager_id: input.managerId || null,
      department: input.department?.trim() || null,
      employee_type: employeeType,
      lunch_eligible: input.lunchEligible ?? true,
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (profileError) return { ok: false, error: `Account created but profile setup failed: ${profileError.message}` };

  // 3. Pre-assign functional + access roles.
  const functional = (input.functionalRoles ?? []).filter((r) =>
    ASSIGNABLE_FUNCTIONAL.includes(r),
  );
  if (functional.length > 0) {
    await admin.from("profile_roles").insert(
      functional.map((r) => ({ profile_id: userId, role: r, tenant_id: tenant.id })),
    );
  }
  if (accessRoleIds.length > 0) {
    await admin.from("profile_access_roles").insert(
      accessRoleIds.map((rid) => ({ profile_id: userId, role_id: rid, tenant_id: tenant.id })),
    );
  }

  revalidatePath("/admin");
  return { ok: true, tempPassword };
}

// --- Bulk staff import --------------------------------------------------------

export interface BulkRow {
  fullName: string;
  email: string;
  managerEmail?: string;
  role?: string;
  department?: string;
  employeeType?: string;
}

export interface BulkRowResult {
  email: string;
  ok: boolean;
  status: "created" | "skipped" | "failed";
  error?: string;
  tempPassword?: string;
}

export interface BulkImportResult extends ActionResult {
  results?: BulkRowResult[];
}

/**
 * Create many staff at once from a parsed list, then link managers by email in
 * a second pass (so a manager listed lower in the file still resolves). Rows
 * with an existing email are skipped, not overwritten. HR/system admin only.
 */
export async function bulkRegisterStaff(input: {
  mode: "invite" | "password";
  rows: BulkRow[];
}): Promise<BulkImportResult> {
  const denied = await requireHr();
  if (denied) return denied;
  if (!input.rows?.length) return { ok: false, error: "No rows to import." };
  if (input.rows.length > 500) return { ok: false, error: "Import is limited to 500 rows at a time." };

  const supabase = createClient();
  const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  if (!tenant) return { ok: false, error: "No tenant in scope." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Server is missing the service-role key." };

  // Known emails in the tenant → id, seeded with existing profiles.
  const { data: existing } = await supabase.from("profiles").select("id, email");
  const emailToId = new Map<string, string>();
  for (const p of existing ?? []) {
    if (p.email) emailToId.set((p.email as string).toLowerCase(), p.id as string);
  }

  const results: BulkRowResult[] = [];
  const managerLinks: { id: string; managerEmail: string }[] = [];

  // Pass 1 — create accounts + profiles (managers linked in pass 2).
  for (const raw of input.rows) {
    const fullName = (raw.fullName ?? "").trim();
    const email = (raw.email ?? "").trim().toLowerCase();
    if (!fullName && !email) continue; // blank line
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push({ email: email || "(blank)", ok: false, status: "failed", error: "Invalid email." });
      continue;
    }
    if (emailToId.has(email)) {
      results.push({ email, ok: false, status: "skipped", error: "Already exists." });
      continue;
    }

    const role: UserRole =
      raw.role && (ASSIGNABLE_ROLES as string[]).includes(raw.role.trim())
        ? (raw.role.trim() as UserRole)
        : "employee";
    const employeeType: EmployeeType = ["employee", "contractor", "guest"].includes(
      (raw.employeeType ?? "").trim(),
    )
      ? (raw.employeeType!.trim() as EmployeeType)
      : "employee";

    let userId: string;
    let tempPassword: string | undefined;
    if (input.mode === "invite") {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
      });
      if (error || !data?.user) {
        results.push({ email, ok: false, status: "failed", error: error?.message ?? "Invite failed." });
        continue;
      }
      userId = data.user.id;
    } else {
      tempPassword = generateTempPassword();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !data?.user) {
        results.push({ email, ok: false, status: "failed", error: error?.message ?? "Create failed." });
        continue;
      }
      userId = data.user.id;
    }

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        email,
        full_name: fullName,
        tenant_id: tenant.id,
        role,
        department: raw.department?.trim() || null,
        employee_type: employeeType,
        is_active: true,
      },
      { onConflict: "id" },
    );
    if (profileError) {
      results.push({ email, ok: false, status: "failed", error: profileError.message });
      continue;
    }

    emailToId.set(email, userId);
    if (raw.managerEmail?.trim()) {
      managerLinks.push({ id: userId, managerEmail: raw.managerEmail.trim().toLowerCase() });
    }
    results.push({ email, ok: true, status: "created", tempPassword });
  }

  // Pass 2 — link managers now that every email is known.
  for (const link of managerLinks) {
    const managerId = emailToId.get(link.managerEmail);
    if (managerId && managerId !== link.id) {
      await admin.from("profiles").update({ manager_id: managerId }).eq("id", link.id);
    }
  }

  revalidatePath("/admin");
  const created = results.filter((r) => r.status === "created").length;
  return { ok: created > 0, results, error: created === 0 ? "No new staff were created." : undefined };
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
