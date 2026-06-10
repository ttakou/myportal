/**
 * Hand-maintained types for the Sprint 1 schema.
 *
 * In a real project, regenerate these with:
 *   supabase gen types typescript --linked > src/types/database.ts
 * They are written by hand here so the foundation compiles before the CLI is wired up.
 */

export type UserRole = "super_admin" | "tenant_admin" | "manager" | "employee";
export type TenantStatus = "active" | "suspended" | "trial" | "archived";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  tenant_id: string | null;
  manager_id: string | null;
  full_name: string | null;
  email: string;
  role: UserRole;
  job_title: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceCatalogItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  route_path: string;
  is_core: boolean;
  sort_order: number;
  created_at: string;
}

export interface TenantService {
  id: string;
  tenant_id: string;
  service_id: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** A tenant_services row joined with its catalog entry — what the sidebar renders. */
export interface ActiveService extends ServiceCatalogItem {
  tenant_service_settings: Record<string, unknown>;
}
