-- Per rotation window + muster group: evacuation & head-count role holders.
create table if not exists public.offshore_emergency_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  lifeboat text not null,
  role text not null check (role in ('evac_leader','evac_assistant','headcount_principal','headcount_assistant')),
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, from_date, to_date, lifeboat, role)
);

alter table public.offshore_emergency_roles enable row level security;

drop policy if exists "offshore_emergency_roles_select" on public.offshore_emergency_roles;
create policy "offshore_emergency_roles_select" on public.offshore_emergency_roles for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());

drop policy if exists "offshore_emergency_roles_admin" on public.offshore_emergency_roles;
create policy "offshore_emergency_roles_admin" on public.offshore_emergency_roles for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())));
