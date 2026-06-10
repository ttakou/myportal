-- =============================================================================
-- Module: Transportation Request — local fleet booking & driver assignment
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname='transport_request_status') then
    create type public.transport_request_status as enum
      ('pending','assigned','in_progress','completed','cancelled');
  end if;
end$$;

create table if not exists public.transport_vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null, plate text, capacity integer not null default 4,
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create index if not exists idx_transport_vehicles_tenant on public.transport_vehicles(tenant_id);

create table if not exists public.transport_drivers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null, phone text,
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create index if not exists idx_transport_drivers_tenant on public.transport_drivers(tenant_id);

create table if not exists public.transport_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requester_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  pickup text not null, dropoff text not null, depart_at timestamptz not null,
  passengers integer not null default 1 check (passengers > 0), purpose text,
  status public.transport_request_status not null default 'pending',
  driver_id uuid references public.transport_drivers(id) on delete set null,
  vehicle_id uuid references public.transport_vehicles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_transport_requests_tenant on public.transport_requests(tenant_id, depart_at);

drop trigger if exists trg_transport_requests_updated_at on public.transport_requests;
create trigger trg_transport_requests_updated_at before update on public.transport_requests
  for each row execute function public.set_updated_at();

alter table public.transport_vehicles enable row level security;
alter table public.transport_drivers  enable row level security;
alter table public.transport_requests enable row level security;

drop policy if exists "transport_vehicles_select" on public.transport_vehicles;
create policy "transport_vehicles_select" on public.transport_vehicles for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "transport_vehicles_admin" on public.transport_vehicles;
create policy "transport_vehicles_admin" on public.transport_vehicles for all to authenticated
  using (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));

drop policy if exists "transport_drivers_select" on public.transport_drivers;
create policy "transport_drivers_select" on public.transport_drivers for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "transport_drivers_admin" on public.transport_drivers;
create policy "transport_drivers_admin" on public.transport_drivers for all to authenticated
  using (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));

drop policy if exists "transport_requests_select_own" on public.transport_requests;
create policy "transport_requests_select_own" on public.transport_requests for select to authenticated
  using (requester_id = auth.uid());
drop policy if exists "transport_requests_select_admin" on public.transport_requests;
create policy "transport_requests_select_admin" on public.transport_requests for select to authenticated
  using (tenant_id=public.current_tenant_id() and public.is_tenant_admin());
drop policy if exists "transport_requests_insert" on public.transport_requests;
create policy "transport_requests_insert" on public.transport_requests for insert to authenticated
  with check (requester_id = auth.uid() and tenant_id = public.current_tenant_id());
drop policy if exists "transport_requests_update_own" on public.transport_requests;
create policy "transport_requests_update_own" on public.transport_requests for update to authenticated
  using (requester_id = auth.uid()) with check (requester_id = auth.uid());
drop policy if exists "transport_requests_admin" on public.transport_requests;
create policy "transport_requests_admin" on public.transport_requests for all to authenticated
  using (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));
