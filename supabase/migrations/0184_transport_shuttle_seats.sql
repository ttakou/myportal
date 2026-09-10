-- Transportation: seats on a shuttle run.
--
-- A shuttle's passenger count is its capacity. Anyone in the tenant books a
-- seat on a run (a shuttle on a date), cancels it, and the driver's task
-- carries the manifest. One live seat per person per run.

create table if not exists public.transport_shuttle_seats (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  shuttle_id uuid not null references public.transport_shuttles(id) on delete cascade,
  ride_date date not null,
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create unique index if not exists transport_shuttle_seats_one_per_run
  on public.transport_shuttle_seats (shuttle_id, ride_date, profile_id) where cancelled_at is null;
create index if not exists idx_transport_shuttle_seats_run
  on public.transport_shuttle_seats (tenant_id, ride_date, shuttle_id);
create index if not exists idx_transport_shuttle_seats_profile
  on public.transport_shuttle_seats (profile_id);

alter table public.transport_shuttle_seats enable row level security;

-- A sign-up sheet: everyone in the tenant sees who is on a run.
drop policy if exists transport_shuttle_seats_select on public.transport_shuttle_seats;
create policy transport_shuttle_seats_select on public.transport_shuttle_seats for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) or (select public.is_super_admin()));

-- You book for yourself, in your tenant.
drop policy if exists transport_shuttle_seats_insert on public.transport_shuttle_seats;
create policy transport_shuttle_seats_insert on public.transport_shuttle_seats for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()) and profile_id = (select auth.uid()));

-- You cancel your own; the desk cancels anyone's.
drop policy if exists transport_shuttle_seats_update on public.transport_shuttle_seats;
create policy transport_shuttle_seats_update on public.transport_shuttle_seats for update to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin()))
  )
  with check (
    profile_id = (select auth.uid())
    or (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (select public.is_tenant_admin()))
  );
