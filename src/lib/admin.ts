import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";

export type EmployeeType = "employee" | "contractor" | "guest";

export interface TenantUser {
  id: string;
  full_name: string | null;
  email: string | null;
  emp_num: string | null;
  role: UserRole;
  job_title: string | null;
  manager_id: string | null;
  is_active: boolean;
  department: string | null;
  lunch_eligible: boolean;
  employee_type: EmployeeType;
  functional_roles: string[];
  access_role_ids: string[];
}

export interface TenantModule {
  service_id: string;
  slug: string;
  name: string;
  description: string | null;
  is_core: boolean;
  is_active: boolean;
  settings: Record<string, unknown>;
}

/** All users in the current tenant (RLS-scoped). */
export async function getTenantUsers(): Promise<TenantUser[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, emp_num, role, job_title, manager_id, is_active, department, lunch_eligible, employee_type, profile_roles(role), profile_access_roles(role_id)")
    .order("full_name");
  if (error) {
    console.error("getTenantUsers:", error.message);
    return [];
  }
  return (data ?? []).map((u: Record<string, any>) => ({
    ...(u as TenantUser),
    functional_roles: (u.profile_roles ?? []).map((r: { role: string }) => r.role),
    access_role_ids: (u.profile_access_roles ?? []).map((r: { role_id: string }) => r.role_id),
  }));
}

export interface PendingUser {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  /** When the holder asked an admin for access (null if they never did). */
  access_requested_at: string | null;
}

/**
 * Tenant-less sign-ups awaiting access (a fresh sign-up or SSO first login).
 * These rows are invisible under RLS (no tenant), so we read them with the
 * service role — callers MUST gate this to administrators. Most-recently
 * requested first, then newest sign-ups.
 */
export async function getPendingUsers(): Promise<PendingUser[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, email, created_at, access_requested_at")
    .is("tenant_id", null)
    .neq("role", "super_admin")
    .eq("is_active", true)
    .order("access_requested_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getPendingUsers:", error.message);
    return [];
  }
  return (data ?? []) as PendingUser[];
}

/** Catalog of modules with whether the current tenant has each one active. */
export async function getTenantModules(): Promise<TenantModule[]> {
  const supabase = createClient();
  const [{ data: catalog }, { data: subs }] = await Promise.all([
    supabase
      .from("services_catalog")
      .select("id, slug, name, description, is_core, sort_order")
      .order("sort_order"),
    supabase.from("tenant_services").select("service_id, is_active, settings"),
  ]);

  const subMap = new Map(
    (subs ?? []).map((s) => [s.service_id, s]),
  );

  return (catalog ?? []).map((c) => {
    const sub = subMap.get(c.id);
    return {
      service_id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      is_core: c.is_core,
      is_active: c.is_core || sub?.is_active === true,
      settings: (sub?.settings ?? {}) as Record<string, unknown>,
    };
  });
}

export interface ImpersonationEvent {
  id: string;
  actor_name: string | null;
  target_name: string | null;
  action: "start" | "stop";
  created_at: string;
}

/** Recent impersonation events for the tenant (RLS limits to admins). */
export async function getImpersonationLog(limit = 50): Promise<ImpersonationEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("impersonation_audit")
    .select(
      "id, action, created_at," +
        " actor:profiles!impersonation_audit_actor_id_fkey(full_name, email)," +
        " target:profiles!impersonation_audit_target_id_fkey(full_name, email)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getImpersonationLog:", error.message);
    return [];
  }
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { full_name?: string; email?: string } | null;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const a = one(r.actor);
    const t = one(r.target);
    return {
      id: r.id as string,
      actor_name: a?.full_name || a?.email || null,
      target_name: t?.full_name || t?.email || null,
      action: r.action as "start" | "stop",
      created_at: r.created_at as string,
    };
  });
}
