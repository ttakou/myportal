-- =============================================================================
-- MyEnterprisePortal — Sprint 1: Multi-Tenant Foundation
-- Migration 0002: Custom Access Token Hook + Row Level Security
-- =============================================================================
-- Strategy: tenant_id and role are injected into the JWT by a Supabase
-- "Custom Access Token Hook" at login / token refresh. RLS policies then read
-- those claims directly from auth.jwt(). Because the check never touches a
-- table, there is no recursion risk on `profiles`, and the check is essentially
-- free (in-memory) on every query.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ ONE-TIME DASHBOARD STEP (cannot be done in SQL):                           │
-- │ Authentication → Hooks → "Customize Access Token (JWT) Claims"             │
-- │   → enable, select  public.custom_access_token_hook                        │
-- │ (Local dev: add the [auth.hook.custom_access_token] block to config.toml.) │
-- └──────────────────────────────────────────────────────────────────────────┘
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Custom Access Token Hook
-- -----------------------------------------------------------------------------
-- Runs inside GoTrue (the supabase_auth_admin role) whenever a token is minted.
-- It looks up the user's profile once and copies tenant_id + role into the
-- token's app_metadata, where they become immutable, signed JWT claims.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims      jsonb;
  v_tenant_id uuid;
  v_role      public.user_role;
begin
  select tenant_id, role
    into v_tenant_id, v_role
  from public.profiles
  where id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  -- Ensure app_metadata exists before we write into it.
  if claims -> 'app_metadata' is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;

  if v_tenant_id is not null then
    claims := jsonb_set(claims, '{app_metadata, tenant_id}', to_jsonb(v_tenant_id));
  end if;

  claims := jsonb_set(
    claims,
    '{app_metadata, user_role}',
    to_jsonb(coalesce(v_role, 'employee'::public.user_role))
  );

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- GoTrue must be able to execute the hook and read profiles; nobody else should.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant select on public.profiles to supabase_auth_admin;
-- Allow the hook to read profiles regardless of RLS.
drop policy if exists "auth_admin_can_read_profiles" on public.profiles;
create policy "auth_admin_can_read_profiles"
  on public.profiles
  as permissive
  for select
  to supabase_auth_admin
  using (true);

-- -----------------------------------------------------------------------------
-- 2. JWT claim helper functions
-- -----------------------------------------------------------------------------
-- Pure JWT readers — no table access, so they are safe to call from any policy
-- (including policies on `profiles`) without triggering recursion.
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
set search_path = ''
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'user_role',
    'employee'
  )::public.user_role;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_user_role() = 'super_admin';
$$;

create or replace function public.is_tenant_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_user_role() in ('super_admin', 'tenant_admin');
$$;

-- -----------------------------------------------------------------------------
-- 3. Enable RLS (deny-by-default once enabled)
-- -----------------------------------------------------------------------------
alter table public.tenants          enable row level security;
alter table public.profiles         enable row level security;
alter table public.services_catalog enable row level security;
alter table public.tenant_services  enable row level security;

-- -----------------------------------------------------------------------------
-- 4. Policies — tenants
-- -----------------------------------------------------------------------------
drop policy if exists "tenants_select" on public.tenants;
create policy "tenants_select"
  on public.tenants for select
  to authenticated
  using (id = public.current_tenant_id() or public.is_super_admin());

drop policy if exists "tenants_admin_write" on public.tenants;
create policy "tenants_admin_write"
  on public.tenants for all
  to authenticated
  using (
    public.is_super_admin()
    or (id = public.current_tenant_id() and public.is_tenant_admin())
  )
  with check (
    public.is_super_admin()
    or (id = public.current_tenant_id() and public.is_tenant_admin())
  );

-- -----------------------------------------------------------------------------
-- 5. Policies — profiles
-- -----------------------------------------------------------------------------
-- Read: anyone in the same tenant (directory). Super admins see everyone.
drop policy if exists "profiles_select_same_tenant" on public.profiles;
create policy "profiles_select_same_tenant"
  on public.profiles for select
  to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());

-- A user may update their own profile, but NOT their tenant_id or role
-- (those are governed by admins / the hook). Column-level protection is added
-- via a trigger below since RLS cannot pin individual columns.
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Tenant admins manage profiles within their own tenant.
drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write"
  on public.profiles for all
  to authenticated
  using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
  )
  with check (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
  );

-- Guard rail: a non-admin cannot escalate their own role or move tenants.
create or replace function public.enforce_profile_immutables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Trusted contexts may change role/tenant_id: backend (service_role or a
  -- direct connection with no JWT) and tenant admins. Regular signed-in users
  -- cannot escalate their own role or switch tenants.
  if auth.jwt() is null
     or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or public.is_tenant_admin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.tenant_id is distinct from old.tenant_id then
    raise exception 'You cannot change your own role or tenant.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_immutables on public.profiles;
create trigger trg_profiles_immutables
  before update on public.profiles
  for each row execute function public.enforce_profile_immutables();

-- -----------------------------------------------------------------------------
-- 6. Policies — services_catalog (global, read-only to tenants)
-- -----------------------------------------------------------------------------
drop policy if exists "services_catalog_select" on public.services_catalog;
create policy "services_catalog_select"
  on public.services_catalog for select
  to authenticated
  using (true);

drop policy if exists "services_catalog_superadmin_write" on public.services_catalog;
create policy "services_catalog_superadmin_write"
  on public.services_catalog for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 7. Policies — tenant_services (the subscription map)
-- -----------------------------------------------------------------------------
-- Every member of a tenant can READ which modules are active (sidebar needs it).
drop policy if exists "tenant_services_select" on public.tenant_services;
create policy "tenant_services_select"
  on public.tenant_services for select
  to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());

-- Only admins toggle subscriptions / edit module settings.
drop policy if exists "tenant_services_admin_write" on public.tenant_services;
create policy "tenant_services_admin_write"
  on public.tenant_services for all
  to authenticated
  using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
  )
  with check (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
  );

-- -----------------------------------------------------------------------------
-- 8. New-user bootstrap
-- -----------------------------------------------------------------------------
-- Create a bare profile row when a new auth user is created so the access-token
-- hook always has something to read. tenant_id is assigned later by an admin
-- (or by an invitation flow in a future sprint).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Invoked only by the trigger above; remove the RPC attack surface.
revoke execute on function public.handle_new_user() from authenticated, anon, public;
