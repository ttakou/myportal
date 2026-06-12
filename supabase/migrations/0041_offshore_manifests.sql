-- =============================================================================
-- Offshore Phase 3: Trip manifests
--
-- A manifest is a planned personnel movement (a crew change leg or ad-hoc trip)
-- with a passenger list. Crew manifests auto-populate from the crew roster.
-- The desk validates eligibility + seats, approves and locks, then confirms
-- the movement — which drives POB through offshore_trips (staff) for outbound
-- and demobilises them on inbound.
-- =============================================================================

create table if not exists public.offshore_manifests (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  title           text not null,
  crew_id         uuid references public.offshore_crews(id) on delete set null,
  installation_id uuid references public.offshore_installations(id) on delete set null,
  trip_type       text not null default 'crew_change_out'
                  check (trip_type in ('crew_change_out','crew_change_in','visitor_out','visitor_in','medevac','adhoc')),
  direction       text not null default 'out' check (direction in ('out','in')),
  transport_mode  text,
  flight_id       uuid references public.helicopter_flights(id) on delete set null,
  seat_capacity   integer not null default 12,
  scheduled_date  date not null,
  status          text not null default 'draft'
                  check (status in ('draft','approved','locked','completed','cancelled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_offshore_manifests_tenant on public.offshore_manifests(tenant_id, scheduled_date);

drop trigger if exists trg_offshore_manifests_updated_at on public.offshore_manifests;
create trigger trg_offshore_manifests_updated_at before update on public.offshore_manifests
  for each row execute function public.set_updated_at();

create table if not exists public.offshore_manifest_pax (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  manifest_id uuid not null references public.offshore_manifests(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,
  person_name text not null,
  position    text,
  boarded     boolean not null default false,
  no_show     boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (manifest_id, profile_id)
);
create index if not exists idx_offshore_manifest_pax_manifest on public.offshore_manifest_pax(manifest_id);

alter table public.offshore_manifests    enable row level security;
alter table public.offshore_manifest_pax enable row level security;

-- Manifests: tenant reads; tenant/safety admins manage.
drop policy if exists "offshore_manifests_select" on public.offshore_manifests;
create policy "offshore_manifests_select" on public.offshore_manifests for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "offshore_manifests_admin" on public.offshore_manifests;
create policy "offshore_manifests_admin" on public.offshore_manifests for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())));

drop policy if exists "offshore_manifest_pax_select" on public.offshore_manifest_pax;
create policy "offshore_manifest_pax_select" on public.offshore_manifest_pax for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "offshore_manifest_pax_admin" on public.offshore_manifest_pax;
create policy "offshore_manifest_pax_admin" on public.offshore_manifest_pax for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())));
