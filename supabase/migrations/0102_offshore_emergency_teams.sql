-- Emergency response teams (HLO, fire team) per rotation window. Unlike the
-- single-holder leader roles in offshore_emergency_roles, these teams have no
-- member limit, so membership is one row per person.
create table if not exists public.offshore_emergency_teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  team text not null check (team in ('hlo','fire_team')),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tenant_id, from_date, to_date, team, profile_id)
);

create index if not exists offshore_emergency_teams_profile_idx
  on public.offshore_emergency_teams (profile_id);

alter table public.offshore_emergency_teams enable row level security;

drop policy if exists "offshore_emergency_teams_select" on public.offshore_emergency_teams;
create policy "offshore_emergency_teams_select" on public.offshore_emergency_teams for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());

drop policy if exists "offshore_emergency_teams_admin" on public.offshore_emergency_teams;
create policy "offshore_emergency_teams_admin" on public.offshore_emergency_teams for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())));
