-- Offshore Phase 3: flag rotation exceptions — early comers / leavers and
-- absentees — with a reason (sick leave, medevac, compassionate, training /
-- logistics, other). Absentees have no trip row (they never mobilised), so the
-- flag is keyed to the person + the date it applies, not to a trip.

create table if not exists public.offshore_rotation_flags (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  installation_id uuid references public.offshore_installations(id) on delete set null,
  kind            text not null
                  check (kind in ('absent','early_arrival','early_departure','late_arrival')),
  reason          text not null
                  check (reason in ('sick','medevac','compassionate','training_logistics','other')),
  note            text,
  effective_date  date not null default current_date,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles(id) on delete set null
);

create index if not exists idx_offshore_rotation_flags_tenant_date
  on public.offshore_rotation_flags (tenant_id, effective_date desc);
create index if not exists idx_offshore_rotation_flags_profile
  on public.offshore_rotation_flags (profile_id);

alter table public.offshore_rotation_flags enable row level security;

drop policy if exists "rotation_flags_select" on public.offshore_rotation_flags;
create policy "rotation_flags_select" on public.offshore_rotation_flags for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());

drop policy if exists "rotation_flags_manage" on public.offshore_rotation_flags;
create policy "rotation_flags_manage" on public.offshore_rotation_flags for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_offshore_manager()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_offshore_manager()));
