-- =============================================================================
-- Role-based module access.
--
-- Admins define named access roles (e.g. "Field staff", "Office"), each
-- granting a set of modules, and assign them to users. A user with NO access
-- roles is unrestricted (sees every module the tenant has switched on) so
-- existing tenants keep working unchanged; a user with one or more roles is
-- limited to the union of their roles' modules — enforced in the sidebar and
-- the middleware.
-- =============================================================================

create table if not exists public.tenant_roles (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  name         text not null,
  description  text,
  module_slugs text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, name)
);

drop trigger if exists trg_tenant_roles_updated_at on public.tenant_roles;
create trigger trg_tenant_roles_updated_at before update on public.tenant_roles
  for each row execute function public.set_updated_at();

create table if not exists public.profile_access_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id    uuid not null references public.tenant_roles(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, role_id)
);
create index if not exists idx_profile_access_roles_role on public.profile_access_roles(role_id);

alter table public.tenant_roles         enable row level security;
alter table public.profile_access_roles enable row level security;

-- Role definitions: everyone in the tenant can read (the sidebar/middleware
-- resolve their own access from them); only admins write.
drop policy if exists "tenant_roles_select" on public.tenant_roles;
create policy "tenant_roles_select" on public.tenant_roles for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "tenant_roles_admin" on public.tenant_roles;
create policy "tenant_roles_admin" on public.tenant_roles for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));

-- Assignments: users read their own; admins read and manage all.
drop policy if exists "profile_access_roles_select_own" on public.profile_access_roles;
create policy "profile_access_roles_select_own" on public.profile_access_roles for select to authenticated
  using (profile_id = auth.uid());
drop policy if exists "profile_access_roles_select_admin" on public.profile_access_roles;
create policy "profile_access_roles_select_admin" on public.profile_access_roles for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin());
drop policy if exists "profile_access_roles_admin" on public.profile_access_roles;
create policy "profile_access_roles_admin" on public.profile_access_roles for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));
