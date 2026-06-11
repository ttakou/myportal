import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

export type EmployeeType = "employee" | "contractor" | "guest";

export interface TenantUser {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  job_title: string | null;
  manager_id: string | null;
  is_active: boolean;
  department: string | null;
  lunch_eligible: boolean;
  employee_type: EmployeeType;
}

export interface TenantModule {
  service_id: string;
  slug: string;
  name: string;
  description: string | null;
  is_core: boolean;
  is_active: boolean;
}

/** All users in the current tenant (RLS-scoped). */
export async function getTenantUsers(): Promise<TenantUser[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, job_title, manager_id, is_active, department, lunch_eligible, employee_type")
    .order("full_name");
  if (error) {
    console.error("getTenantUsers:", error.message);
    return [];
  }
  return (data ?? []) as TenantUser[];
}

/** Catalog of modules with whether the current tenant has each one active. */
export async function getTenantModules(): Promise<TenantModule[]> {
  const supabase = createClient();
  const [{ data: catalog }, { data: subs }] = await Promise.all([
    supabase
      .from("services_catalog")
      .select("id, slug, name, description, is_core, sort_order")
      .order("sort_order"),
    supabase.from("tenant_services").select("service_id, is_active"),
  ]);

  const activeMap = new Map(
    (subs ?? []).map((s) => [s.service_id, s.is_active]),
  );

  return (catalog ?? []).map((c) => ({
    service_id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    is_core: c.is_core,
    is_active: c.is_core || activeMap.get(c.id) === true,
  }));
}
