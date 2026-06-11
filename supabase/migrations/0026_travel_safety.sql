-- =============================================================================
-- Travel Safety upgrade for the Out-of-Town module
--
-- Turns the trip record into an Employee Travel Safety declaration:
--   * richer declaration fields (travel type, transport, route, contacts)
--   * a safety phase (declared -> departed -> arrived -> returned) driven by
--     employee check-ins, with a check-in log (public.trip_checkins)
--   * destination emergency contacts (public.travel_emergency_contacts)
--
-- The "I need help" action creates an EESS incident in the app layer (so it
-- reuses the existing responder fan-out); nothing extra is needed here.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname='trip_travel_type') then
    create type public.trip_travel_type as enum
      ('business','field_mission','training','leave','personal','emergency');
  end if;
  if not exists (select 1 from pg_type where typname='trip_phase') then
    create type public.trip_phase as enum ('declared','departed','arrived','returned');
  end if;
  if not exists (select 1 from pg_type where typname='trip_checkin_kind') then
    create type public.trip_checkin_kind as enum
      ('departed','arrived','safe','returned','help');
  end if;
end$$;

-- --- Declaration + safety fields on the trip --------------------------------
alter table public.out_of_town_trips
  add column if not exists travel_type            public.trip_travel_type not null default 'business',
  add column if not exists transport_mode         text,
  add column if not exists route                  text,
  add column if not exists accommodation          text,
  add column if not exists contact_number         text,
  add column if not exists dest_emergency_contact text,
  add column if not exists phase                  public.trip_phase not null default 'declared',
  add column if not exists departed_at            timestamptz,
  add column if not exists arrived_at             timestamptz,
  add column if not exists returned_at            timestamptz,
  add column if not exists last_checkin_at        timestamptz;

-- --- Safety check-in log ----------------------------------------------------
create table if not exists public.trip_checkins (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  trip_id     uuid not null references public.out_of_town_trips(id) on delete cascade,
  profile_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind        public.trip_checkin_kind not null,
  note        text,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now()
);
create index if not exists idx_trip_checkins_trip on public.trip_checkins(trip_id, created_at desc);

-- --- Destination emergency contacts -----------------------------------------
create table if not exists public.travel_emergency_contacts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  destination text not null,
  category    text not null default 'other'
              check (category in ('hospital','police','embassy','company','other')),
  name        text not null,
  phone       text,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_travel_contacts_tenant
  on public.travel_emergency_contacts(tenant_id, destination);

-- --- RLS --------------------------------------------------------------------
alter table public.trip_checkins              enable row level security;
alter table public.travel_emergency_contacts  enable row level security;

-- Check-ins: visible to anyone who can see the parent trip (own / manager /
-- admin via the trips policies); only the traveller writes their own.
drop policy if exists "trip_checkins_select" on public.trip_checkins;
create policy "trip_checkins_select" on public.trip_checkins for select to authenticated
  using (exists (select 1 from public.out_of_town_trips t where t.id = trip_id));
drop policy if exists "trip_checkins_insert" on public.trip_checkins;
create policy "trip_checkins_insert" on public.trip_checkins for insert to authenticated
  with check (
    profile_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and exists (select 1 from public.out_of_town_trips t
                where t.id = trip_id and t.requester_id = auth.uid())
  );

-- Emergency contacts: everyone in the tenant reads; admins/safety admins write.
drop policy if exists "travel_contacts_select" on public.travel_emergency_contacts;
create policy "travel_contacts_select" on public.travel_emergency_contacts for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists "travel_contacts_write" on public.travel_emergency_contacts;
create policy "travel_contacts_write" on public.travel_emergency_contacts for all to authenticated
  using (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin()))
  with check (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin()));

-- --- Seed a few destination contacts for the Addax tenant -------------------
insert into public.travel_emergency_contacts (tenant_id, destination, category, name, phone, note)
select t.id, v.destination, v.category, v.name, v.phone, v.note
from public.tenants t
cross join (values
  ('Douala',  'hospital', 'Hôpital Général de Douala',  '+237 233 37 00 33', 'Emergency / 24h'),
  ('Douala',  'police',   'Police Secours',             '117',               'National emergency line'),
  ('Yaoundé', 'hospital', 'Hôpital Central de Yaoundé',  '+237 222 23 40 20', 'Emergency / 24h'),
  ('Yaoundé', 'police',   'Police Secours',             '117',               'National emergency line')
) as v(destination, category, name, phone, note)
where t.slug = 'addax-petroleum'
  and not exists (
    select 1 from public.travel_emergency_contacts e
    where e.tenant_id = t.id and e.destination = v.destination and e.name = v.name
  );
