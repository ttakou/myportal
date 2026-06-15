create table if not exists public.offshore_muster_drills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  started_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  kind text not null default 'drill'
);
create table if not exists public.offshore_muster_checkins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  drill_id uuid not null references public.offshore_muster_drills(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  lifeboat text,
  accounted boolean not null default false,
  accounted_at timestamptz,
  accounted_by uuid references public.profiles(id) on delete set null
);
create index if not exists muster_checkins_drill on public.offshore_muster_checkins (drill_id);

alter table public.offshore_muster_drills enable row level security;
alter table public.offshore_muster_checkins enable row level security;

drop policy if exists "muster_drills_select" on public.offshore_muster_drills;
create policy "muster_drills_select" on public.offshore_muster_drills for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "muster_drills_admin" on public.offshore_muster_drills;
create policy "muster_drills_admin" on public.offshore_muster_drills for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())));

drop policy if exists "muster_checkins_select" on public.offshore_muster_checkins;
create policy "muster_checkins_select" on public.offshore_muster_checkins for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "muster_checkins_admin" on public.offshore_muster_checkins;
create policy "muster_checkins_admin" on public.offshore_muster_checkins for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())));
