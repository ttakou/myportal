-- =============================================================================
-- MyEnterprisePortal — Sprint 1: Multi-Tenant Foundation
-- Migration 0001: Core schema (tenants, profiles, services_catalog, tenant_services)
-- =============================================================================
-- This migration is intentionally free of RLS policies. Policies and the
-- JWT access-token hook live in 0002_rls_policies.sql so that the data model
-- and the security model can be reviewed independently.
-- =============================================================================

-- Postgres extensions ---------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
-- Application-level roles for RBAC. `super_admin` is platform staff (cross-tenant);
-- everyone else is scoped to a single tenant.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum (
      'super_admin',   -- MyEnterprisePortal platform staff (cross-tenant)
      'tenant_admin',  -- Company administrator (manages their own tenant)
      'manager',       -- Has direct reports
      'employee'       -- Standard ESS user
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'tenant_status') then
    create type public.tenant_status as enum ('active', 'suspended', 'trial', 'archived');
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- tenants — one row per client company
-- -----------------------------------------------------------------------------
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,                 -- url-safe identifier, e.g. "acme-oil"
  status      public.tenant_status not null default 'trial',
  settings    jsonb not null default '{}'::jsonb,   -- tenant-wide preferences (branding, timezone…)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

comment on table public.tenants is 'Client companies. Root of the multi-tenant hierarchy.';

-- -----------------------------------------------------------------------------
-- profiles — application user, 1:1 with auth.users
-- -----------------------------------------------------------------------------
-- A profile MUST belong to a tenant (except super_admin, which may be NULL).
-- manager_id is a self-reference that models the reporting hierarchy used by
-- approval workflows in later sprints (trips, finance, performance).
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  tenant_id    uuid references public.tenants (id) on delete cascade,
  manager_id   uuid references public.profiles (id) on delete set null,
  full_name    text,
  email        text not null,
  role         public.user_role not null default 'employee',
  job_title    text,
  avatar_url   text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()

  -- Note: tenant_id is intentionally nullable. A freshly signed-up user has no
  -- tenant until an admin assigns one (the handle_new_user trigger creates a
  -- "pending" profile). RLS makes a tenant-less profile harmless because
  -- current_tenant_id() is null, so the user can see nothing until assigned.
);

create index if not exists idx_profiles_tenant_id on public.profiles (tenant_id);
create index if not exists idx_profiles_manager_id on public.profiles (manager_id);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

comment on table public.profiles is 'Application users, linked 1:1 to auth.users. Carries tenant + reporting hierarchy.';

-- -----------------------------------------------------------------------------
-- services_catalog — master list of the 9 modules
-- -----------------------------------------------------------------------------
-- Global, tenant-agnostic. Seeded once. The `route_path` and `icon` columns let
-- the UI and middleware stay fully data-driven.
create table if not exists public.services_catalog (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,                -- stable key, e.g. "canteen"
  name         text not null,
  description  text,
  icon         text,                                -- lucide-react icon name
  route_path   text not null unique,                -- base route, e.g. "/canteen"
  is_core      boolean not null default false,      -- core modules cannot be unsubscribed
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

comment on table public.services_catalog is 'Master catalogue of the 9 portal modules. Global, not tenant-scoped.';

-- -----------------------------------------------------------------------------
-- tenant_services — junction: which modules a tenant has switched on
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_services (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  service_id  uuid not null references public.services_catalog (id) on delete cascade,
  is_active   boolean not null default true,
  settings    jsonb not null default '{}'::jsonb,   -- per-module, per-tenant config
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint tenant_services_unique unique (tenant_id, service_id)
);

create index if not exists idx_tenant_services_tenant_id on public.tenant_services (tenant_id);
create index if not exists idx_tenant_services_active
  on public.tenant_services (tenant_id) where is_active;

create trigger trg_tenant_services_updated_at
  before update on public.tenant_services
  for each row execute function public.set_updated_at();

comment on table public.tenant_services is 'Maps tenants to their active modules. JSONB settings hold per-tenant module config.';

-- -----------------------------------------------------------------------------
-- Seed: the 9 scoped modules
-- -----------------------------------------------------------------------------
insert into public.services_catalog (slug, name, description, icon, route_path, is_core, sort_order)
values
  ('core',           'Core System & RBAC',          'Multi-tenancy, users, roles and access control.',              'ShieldCheck',  '/admin',          true,  0),
  ('canteen',        'Canteen Management',          'Dual-kitchen meal booking, guest seats and campboss dashboard.','UtensilsCrossed','/canteen',       false, 10),
  ('transportation', 'Transportation Request',      'Local fleet booking and driver assignment.',                   'Car',          '/transportation', false, 20),
  ('out-of-town',    'Out of Town Trip',            'Missions, multi-tier finance approval and expense reconciliation.','Plane',     '/out-of-town',    false, 30),
  ('offshore',       'Offshore Trip',               'HSE gatekeeper, helicopter manifests and POB/bed tracking.',    'Ship',         '/offshore',       false, 40),
  ('visitors',       'Visitor Management',          'Pre-registration, kiosk check-in and emergency muster lists.',  'UserCheck',    '/visitors',       false, 50),
  ('medical',        'Fitness to Work & Medical',   'Confidential medical statuses and automated expiry warnings.',  'HeartPulse',   '/medical',        false, 60),
  ('savings',        'Employees Saving Management', 'Cooperative fund ledger, loan amortization and payroll sync.',  'PiggyBank',    '/savings',        false, 70),
  ('performance',    'Performance Management',      'OKRs, 1-on-1 agendas, continuous feedback and 9-box grid.',     'TrendingUp',   '/performance',    false, 80)
on conflict (slug) do update
  set name        = excluded.name,
      description = excluded.description,
      icon        = excluded.icon,
      route_path  = excluded.route_path,
      is_core     = excluded.is_core,
      sort_order  = excluded.sort_order;
