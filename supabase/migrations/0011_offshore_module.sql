-- Module: Offshore Trip — HSE gatekeeper, helicopter manifests, POB/bed tracking
do $$
begin
  if not exists (select 1 from pg_type where typname='offshore_status') then
    create type public.offshore_status as enum
      ('requested','hse_cleared','manifested','onboard','demobilised','cancelled');
  end if;
end$$;

create table if not exists public.offshore_installations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null, pob_capacity integer not null default 0,
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create index if not exists idx_offshore_installations_tenant on public.offshore_installations(tenant_id);

create table if not exists public.helicopter_flights (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  flight_date date not null, route text not null, seats integer not null default 12,
  created_at timestamptz not null default now()
);
create index if not exists idx_helicopter_flights_tenant on public.helicopter_flights(tenant_id, flight_date);

create table if not exists public.offshore_trips (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  installation_id uuid references public.offshore_installations(id) on delete set null,
  mobilize_date date not null, demob_date date,
  status public.offshore_status not null default 'requested',
  hse_cleared_at timestamptz, hse_cleared_by uuid references public.profiles(id) on delete set null,
  flight_id uuid references public.helicopter_flights(id) on delete set null, bed_no text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_offshore_trips_tenant on public.offshore_trips(tenant_id, status);

drop trigger if exists trg_offshore_trips_updated_at on public.offshore_trips;
create trigger trg_offshore_trips_updated_at before update on public.offshore_trips
  for each row execute function public.set_updated_at();

create or replace function public.offshore_hse_gate()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status in ('manifested','onboard') and new.hse_cleared_at is null then
    raise exception 'HSE clearance is required before manifesting or boarding';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_offshore_hse_gate on public.offshore_trips;
create trigger trg_offshore_hse_gate before insert or update on public.offshore_trips
  for each row execute function public.offshore_hse_gate();

create or replace view public.offshore_pob with (security_invoker = true) as
  select i.id as installation_id, i.tenant_id, i.name, i.pob_capacity,
         count(t.id) filter (where t.status='onboard') as pob
  from public.offshore_installations i
  left join public.offshore_trips t on t.installation_id = i.id
  group by i.id, i.tenant_id, i.name, i.pob_capacity;

alter table public.offshore_installations enable row level security;
alter table public.helicopter_flights     enable row level security;
alter table public.offshore_trips         enable row level security;

drop policy if exists "offshore_inst_select" on public.offshore_installations;
create policy "offshore_inst_select" on public.offshore_installations for select to authenticated
  using (tenant_id=public.current_tenant_id() or public.is_super_admin());
drop policy if exists "offshore_inst_admin" on public.offshore_installations;
create policy "offshore_inst_admin" on public.offshore_installations for all to authenticated
  using (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));
drop policy if exists "heli_select" on public.helicopter_flights;
create policy "heli_select" on public.helicopter_flights for select to authenticated
  using (tenant_id=public.current_tenant_id() or public.is_super_admin());
drop policy if exists "heli_admin" on public.helicopter_flights;
create policy "heli_admin" on public.helicopter_flights for all to authenticated
  using (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));
drop policy if exists "offshore_trips_select_own" on public.offshore_trips;
create policy "offshore_trips_select_own" on public.offshore_trips for select to authenticated using (profile_id = auth.uid());
drop policy if exists "offshore_trips_select_admin" on public.offshore_trips;
create policy "offshore_trips_select_admin" on public.offshore_trips for select to authenticated
  using (tenant_id=public.current_tenant_id() and public.is_tenant_admin());
drop policy if exists "offshore_trips_insert" on public.offshore_trips;
create policy "offshore_trips_insert" on public.offshore_trips for insert to authenticated
  with check (profile_id = auth.uid() and tenant_id = public.current_tenant_id());
drop policy if exists "offshore_trips_update_own" on public.offshore_trips;
create policy "offshore_trips_update_own" on public.offshore_trips for update to authenticated
  using (profile_id = auth.uid() and status='requested') with check (profile_id = auth.uid());
drop policy if exists "offshore_trips_admin" on public.offshore_trips;
create policy "offshore_trips_admin" on public.offshore_trips for all to authenticated
  using (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));
