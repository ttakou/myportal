-- =============================================================================
-- Meet & Greet + Airport Assistance
--
-- Layers airport reception onto a travel-safety trip:
--   * flight + traveler-type fields on public.out_of_town_trips
--   * public.airport_assistance — one reception record per trip (greeter,
--     driver, vehicle, meeting point, VIP/name-board/language, status workflow)
--
-- Tenant admins act as the travel desk; the traveller may request a service and
-- read their own. Greeters/drivers are captured as name + phone (no accounts).
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname='traveler_type') then
    create type public.traveler_type as enum
      ('employee','executive','visitor','contractor','consultant','expatriate','vip');
  end if;
  if not exists (select 1 from pg_type where typname='flight_status') then
    create type public.flight_status as enum
      ('scheduled','delayed','landed','missed','rescheduled');
  end if;
  if not exists (select 1 from pg_type where typname='airport_service_type') then
    create type public.airport_service_type as enum ('arrival','departure','both');
  end if;
  if not exists (select 1 from pg_type where typname='airport_assist_status') then
    create type public.airport_assist_status as enum
      ('requested','assigned','arrived','met','picked_up','dropped_off','closed');
  end if;
end$$;

-- --- Flight + traveler-type on the trip -------------------------------------
alter table public.out_of_town_trips
  add column if not exists traveler_type     public.traveler_type not null default 'employee',
  add column if not exists airline           text,
  add column if not exists flight_number     text,
  add column if not exists terminal          text,
  add column if not exists flight_arrival_at timestamptz,
  add column if not exists flight_status     public.flight_status not null default 'scheduled';

-- --- Airport assistance / meet & greet record -------------------------------
create table if not exists public.airport_assistance (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  trip_id       uuid not null unique references public.out_of_town_trips(id) on delete cascade,
  service_type  public.airport_service_type not null default 'arrival',
  status        public.airport_assist_status not null default 'requested',
  greeter_name  text,
  greeter_phone text,
  driver_name   text,
  driver_phone  text,
  vehicle       text,            -- type + plate, e.g. "Toyota Prado · LT-123-AB"
  pickup_point  text,            -- terminal / arrival hall
  meeting_point text,            -- where the greeter waits
  name_board    boolean not null default false,
  vip           boolean not null default false,
  language      text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_airport_assist_tenant
  on public.airport_assistance(tenant_id, status);

drop trigger if exists trg_airport_assist_updated_at on public.airport_assistance;
create trigger trg_airport_assist_updated_at before update on public.airport_assistance
  for each row execute function public.set_updated_at();

-- --- RLS --------------------------------------------------------------------
alter table public.airport_assistance enable row level security;

-- Read: the traveller who owns the trip, plus tenant admins (travel desk).
drop policy if exists "airport_assist_select" on public.airport_assistance;
create policy "airport_assist_select" on public.airport_assistance for select to authenticated
  using (
    (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
    or exists (select 1 from public.out_of_town_trips t
               where t.id = trip_id and t.requester_id = auth.uid())
  );

-- Request: the traveller can request a service for their own trip.
drop policy if exists "airport_assist_insert" on public.airport_assistance;
create policy "airport_assist_insert" on public.airport_assistance for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and (
      public.is_tenant_admin()
      or exists (select 1 from public.out_of_town_trips t
                 where t.id = trip_id and t.requester_id = auth.uid())
    )
  );

-- Assign / advance / delete: the travel desk (admins) only.
drop policy if exists "airport_assist_admin" on public.airport_assistance;
create policy "airport_assist_admin" on public.airport_assistance for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));
