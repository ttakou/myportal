"use server";

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccess, getCurrentRole, type FunctionalRole } from "@/lib/auth";
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
  "oim",
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

/** Normalise a name to an order/separator-insensitive key (e.g. "Tetu Lewis" == "Lewis.Tetu"). */
function normName(name: string | null | undefined): string | null {
  if (!name) return null;
  const tokens = name
    .toLowerCase()
    .replace(/[._]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort();
  return tokens.length ? tokens.join(" ") : null;
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

/** Set or update a user's real email (for accounts created without one). */
export async function updateUserEmail(userId: string, email: string): Promise<ActionResult> {
  const denied = await requireHr();
  if (denied) return denied;
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: "Enter a valid email." };

  const supabase = createClient();
  const { data: target } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!target) return { ok: false, error: "User not found in your organisation." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Server is missing the service-role key." };
  const { error } = await admin.auth.admin.updateUserById(userId, { email: clean, email_confirm: true });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("already") ? "That email is already in use." : error.message,
    };
  }
  await admin.from("profiles").update({ email: clean }).eq("id", userId);
  revalidatePath("/admin");
  return { ok: true };
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
  const realEmail = input.email.trim().toLowerCase();
  if (!fullName) return { ok: false, error: "Full name is required." };
  if (realEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(realEmail))
    return { ok: false, error: "Enter a valid email (or leave it blank to add later)." };
  // Auth needs a unique login id even when no real email is known yet; use an
  // internal placeholder and keep profiles.email null until one is set.
  const hasEmail = realEmail.length > 0;
  const email = hasEmail ? realEmail : `pending-${randomBytes(6).toString("hex")}@no-email.local`;
  // Without a real email we can't send an invitation — fall back to a password.
  const mode = hasEmail ? input.mode : "password";
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
  if (mode === "invite") {
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
      email: hasEmail ? email : null,
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

  // Known people in the tenant, keyed by email AND by normalized name, so rows
  // are matched by name when no email is given (avoids duplicates).
  const { data: existing } = await supabase.from("profiles").select("id, email, full_name");
  const emailToId = new Map<string, string>();
  const nameToId = new Map<string, string>();
  for (const p of existing ?? []) {
    if (p.email) emailToId.set((p.email as string).toLowerCase(), p.id as string);
    const nk = normName(p.full_name as string | null);
    if (nk) nameToId.set(nk, p.id as string);
  }

  const results: BulkRowResult[] = [];
  const managerLinks: { id: string; managerEmail: string }[] = [];

  // Pass 1 — create accounts + profiles (managers linked in pass 2).
  for (const raw of input.rows) {
    const fullName = (raw.fullName ?? "").trim();
    const realEmail = (raw.email ?? "").trim().toLowerCase();
    if (!fullName && !realEmail) continue; // blank line
    const hasEmail = realEmail.length > 0;
    if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(realEmail)) {
      results.push({ email: realEmail, ok: false, status: "failed", error: "Invalid email." });
      continue;
    }
    if (!hasEmail && !fullName) continue;
    const label = realEmail || fullName;
    // Already on the books? Match by email, else by normalized name.
    const nkey = normName(fullName);
    if ((hasEmail && emailToId.has(realEmail)) || (!hasEmail && nkey && nameToId.has(nkey))) {
      results.push({ email: label, ok: false, status: "skipped", error: "Already exists." });
      continue;
    }
    // Login id: real email, or an internal placeholder when none is provided.
    const email = hasEmail ? realEmail : `pending-${randomBytes(6).toString("hex")}@no-email.local`;
    const mode = hasEmail ? input.mode : "password";

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
    if (mode === "invite") {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
      });
      if (error || !data?.user) {
        results.push({ email: label, ok: false, status: "failed", error: error?.message ?? "Invite failed." });
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
        results.push({ email: label, ok: false, status: "failed", error: error?.message ?? "Create failed." });
        continue;
      }
      userId = data.user.id;
    }

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        email: hasEmail ? realEmail : null,
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
      results.push({ email: label, ok: false, status: "failed", error: profileError.message });
      continue;
    }

    if (hasEmail) emailToId.set(realEmail, userId);
    if (nkey) nameToId.set(nkey, userId);
    if (raw.managerEmail?.trim()) {
      managerLinks.push({ id: userId, managerEmail: raw.managerEmail.trim().toLowerCase() });
    }
    results.push({ email: label, ok: true, status: "created", tempPassword });
  }

  // Pass 2 — link managers now that everyone is known (by email or name).
  for (const link of managerLinks) {
    const managerId =
      emailToId.get(link.managerEmail) ?? nameToId.get(normName(link.managerEmail) ?? "~");
    if (managerId && managerId !== link.id) {
      await admin.from("profiles").update({ manager_id: managerId }).eq("id", link.id);
    }
  }

  revalidatePath("/admin");
  const created = results.filter((r) => r.status === "created").length;
  return { ok: created > 0, results, error: created === 0 ? "No new staff were created." : undefined };
}

// --- Tenant branding ---------------------------------------------------------

async function tenantForBranding(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
  return data?.id ?? null;
}

/** Merge a patch into tenants.settings.branding (system admin, service role). */
export async function updateTenantBranding(patch: {
  name?: string;
  primary?: string;
  primaryDark?: string;
  charcoal?: string;
  logoUrl?: string | null;
}): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const tenantId = await tenantForBranding();
  if (!tenantId) return { ok: false, error: "No tenant in scope." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Server is missing the service-role key." };

  const hex = /^#[0-9a-fA-F]{6}$/;
  for (const [k, v] of Object.entries(patch)) {
    if (["primary", "primaryDark", "charcoal"].includes(k) && v && !hex.test(v as string)) {
      return { ok: false, error: `${k} must be a hex colour like #E2001A.` };
    }
  }

  const { data: row } = await admin.from("tenants").select("settings").eq("id", tenantId).maybeSingle();
  const settings = (row?.settings as Record<string, unknown>) ?? {};
  const branding = { ...((settings.branding as Record<string, unknown>) ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null || v === "") delete branding[k];
    else branding[k] = typeof v === "string" ? v.trim() : v;
  }
  const { error } = await admin
    .from("tenants")
    .update({ settings: { ...settings, branding } })
    .eq("id", tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Upload a logo image (data URL) to the branding bucket and set it. */
export async function uploadTenantLogo(input: {
  dataUrl: string;
  contentType: string;
}): Promise<ActionResult & { url?: string }> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const tenantId = await tenantForBranding();
  if (!tenantId) return { ok: false, error: "No tenant in scope." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Server is missing the service-role key." };

  const allowed: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
    "image/webp": "webp",
  };
  const ext = allowed[input.contentType];
  if (!ext) return { ok: false, error: "Use a PNG, JPG, SVG or WebP image." };

  const base64 = input.dataUrl.split(",")[1] ?? "";
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) return { ok: false, error: "Empty image." };
  if (buffer.length > 2_000_000) return { ok: false, error: "Logo must be under 2 MB." };

  const path = `${tenantId}/logo-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from("branding")
    .upload(path, buffer, { contentType: input.contentType, upsert: true });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: pub } = admin.storage.from("branding").getPublicUrl(path);
  const set = await updateTenantBranding({ logoUrl: pub.publicUrl });
  if (!set.ok) return set;
  return { ok: true, url: pub.publicUrl };
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

// --- Impersonation (super admin "act as" another user) -----------------------

const IMP_RT = "imp_admin_rt"; // saved admin refresh token (httpOnly)
const IMP_ACTIVE = "imp_active"; // impersonated user id (readable flag)
const IMP_ACTOR = "imp_actor"; // admin id, for the stop-event audit (httpOnly)

/**
 * Super-admin acts as another user: swap the auth session to the target (via a
 * service-role magic-link OTP) after stashing the admin's refresh token so it
 * can be restored with stopImpersonation().
 */
export async function startImpersonation(userId: string): Promise<ActionResult> {
  if ((await getCurrentRole()) !== "super_admin")
    return { ok: false, error: "Only super admins can impersonate." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service role not configured." };

  const { data: tgt, error: gErr } = await admin.auth.admin.getUserById(userId);
  if (gErr || !tgt?.user) return { ok: false, error: gErr?.message ?? "User not found." };
  const email = tgt.user.email;
  if (!email) return { ok: false, error: "This user has no email address to impersonate." };

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: "No active session." };

  const { data: link, error: lErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const otp = link?.properties?.email_otp;
  if (lErr || !otp) return { ok: false, error: lErr?.message ?? "Could not generate a session." };

  const store = cookies();
  // Save the admin's refresh token *before* the auth cookie is overwritten.
  store.set(IMP_RT, session.refresh_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  const { error: vErr } = await supabase.auth.verifyOtp({ email, token: otp, type: "magiclink" });
  if (vErr) {
    store.delete(IMP_RT);
    return { ok: false, error: vErr.message };
  }
  store.set(IMP_ACTIVE, userId, { secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });

  // Audit (service role bypasses RLS; record the acting super-admin).
  const actorId = session.user.id;
  store.set(IMP_ACTOR, actorId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
  const { data: actorProfile } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("id", actorId)
    .maybeSingle();
  await admin.from("impersonation_audit").insert({
    tenant_id: actorProfile?.tenant_id ?? null,
    actor_id: actorId,
    target_id: userId,
    action: "start",
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Restore the super-admin's own session and end impersonation. */
export async function stopImpersonation(): Promise<ActionResult> {
  const store = cookies();
  const rt = store.get(IMP_RT)?.value;
  if (!rt) return { ok: false, error: "Not impersonating." };
  const actorId = store.get(IMP_ACTOR)?.value ?? null;
  const targetId = store.get(IMP_ACTIVE)?.value ?? null;
  const supabase = createClient();
  const { error } = await supabase.auth.refreshSession({ refresh_token: rt });
  store.delete(IMP_RT);
  store.delete(IMP_ACTIVE);
  store.delete(IMP_ACTOR);
  if (error) return { ok: false, error: `Could not restore your session: ${error.message}` };

  const admin = createAdminClient();
  if (admin && actorId) {
    const { data: actorProfile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", actorId)
      .maybeSingle();
    await admin.from("impersonation_audit").insert({
      tenant_id: actorProfile?.tenant_id ?? null,
      actor_id: actorId,
      target_id: targetId,
      action: "stop",
    });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
