-- =============================================================================
-- Offshore: Crew Change, Roster, Accommodation (Phase 1 foundation)
--
-- Adds the master data behind the core questions: who belongs to which crew,
-- which room/bed they use, who has expired certs, and how POB sits against
-- capacity. Builds on the existing offshore_installations / offshore_trips.
-- =============================================================================

-- --- Crew change groups ------------------------------------------------------
create table if not exists public.offshore_crews (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  name               text not null,                  -- Crew A, Night Shift, Marine Crew
  installation_id    uuid references public.offshore_installations(id) on delete set null,
  rotation_pattern   text,                           -- "14/14", "28/28", custom label
  offshore_days      integer not null default 14,
  onshore_days       integer not null default 14,
  transport_mode     text,                           -- helicopter, crew boat, supply vessel
  departure_location text,                           -- Douala, Kribi heliport, jetty
  color              text,                           -- UI accent
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, name)
);
create index if not exists idx_offshore_crews_tenant on public.offshore_crews(tenant_id);

drop trigger if exists trg_offshore_crews_updated_at on public.offshore_crews;
create trigger trg_offshore_crews_updated_at before update on public.offshore_crews
  for each row execute function public.set_updated_at();

-- --- Accommodation: rooms ----------------------------------------------------
create table if not exists public.offshore_rooms (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  installation_id    uuid not null references public.offshore_installations(id) on delete cascade,
  block              text,                           -- Accommodation Block 1
  room_number        text not null,                  -- A-203
  room_type          text not null default 'shared', -- single, double, shared, vip, medic
  bed_count          integer not null default 1,     -- current configuration
  max_bed_count      integer not null default 1,     -- max safe capacity
  gender_restriction text not null default 'any'     -- any | male | female
                     check (gender_restriction in ('any','male','female')),
  status             text not null default 'available'
                     check (status in ('available','occupied','reserved','blocked','maintenance','cleaning')),
  special_flag       text,                           -- vip, medical, isolation, OIM
  notes              text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (installation_id, room_number)
);
create index if not exists idx_offshore_rooms_tenant on public.offshore_rooms(tenant_id, installation_id);

drop trigger if exists trg_offshore_rooms_updated_at on public.offshore_rooms;
create trigger trg_offshore_rooms_updated_at before update on public.offshore_rooms
  for each row execute function public.set_updated_at();

-- --- Offshore staff roster ---------------------------------------------------
create table if not exists public.offshore_staff (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  profile_id        uuid not null unique references public.profiles(id) on delete cascade,
  crew_id           uuid references public.offshore_crews(id) on delete set null,
  position          text,                            -- supervisor, operator, technician, medic
  fixed_room_id     uuid references public.offshore_rooms(id) on delete set null,
  fixed_bed         text,                            -- Bed 1, Upper bunk
  back_to_back_id   uuid references public.profiles(id) on delete set null,
  medical_expiry    date,
  bosiet_expiry     date,                            -- offshore survival cert
  huet_expiry       date,                            -- helicopter escape cert
  emergency_contact text,
  travel_eligible   boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_offshore_staff_tenant on public.offshore_staff(tenant_id);
create index if not exists idx_offshore_staff_crew on public.offshore_staff(crew_id);

drop trigger if exists trg_offshore_staff_updated_at on public.offshore_staff;
create trigger trg_offshore_staff_updated_at before update on public.offshore_staff
  for each row execute function public.set_updated_at();

-- --- Trip extensions: category, crew, room/bed -------------------------------
alter table public.offshore_trips
  add column if not exists category   text not null default 'staff'
    check (category in ('staff','visitor')),
  add column if not exists trip_type  text not null default 'crew_change_out'
    check (trip_type in ('crew_change_out','crew_change_in','visitor_out','visitor_in','medevac','adhoc')),
  add column if not exists crew_id    uuid references public.offshore_crews(id) on delete set null,
  add column if not exists room_id    uuid references public.offshore_rooms(id) on delete set null;

-- --- RLS ---------------------------------------------------------------------
alter table public.offshore_crews enable row level security;
alter table public.offshore_rooms enable row level security;
alter table public.offshore_staff enable row level security;

-- Crews & rooms: tenant reads, admins/safety admins manage.
drop policy if exists "offshore_crews_select" on public.offshore_crews;
create policy "offshore_crews_select" on public.offshore_crews for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "offshore_crews_admin" on public.offshore_crews;
create policy "offshore_crews_admin" on public.offshore_crews for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())));

drop policy if exists "offshore_rooms_select" on public.offshore_rooms;
create policy "offshore_rooms_select" on public.offshore_rooms for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "offshore_rooms_admin" on public.offshore_rooms;
create policy "offshore_rooms_admin" on public.offshore_rooms for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())));

-- Roster: tenant reads (people can see crews), admins/safety admins manage.
drop policy if exists "offshore_staff_select" on public.offshore_staff;
create policy "offshore_staff_select" on public.offshore_staff for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists "offshore_staff_admin" on public.offshore_staff;
create policy "offshore_staff_admin" on public.offshore_staff for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or public.is_safety_admin())));
