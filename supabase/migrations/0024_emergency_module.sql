-- =============================================================================
-- Employee Emergency Support System (EESS)
--
-- Three layers of crisis management:
--   A. SOS & incident reporting          -> public.eess_incidents
--   B. Mass broadcast & geofenced alerts -> public.eess_broadcasts
--   C. Real-time check-in & accountability -> public.eess_checkins
--
-- Safety coordinators are gated by the `safety_admin` functional role (or any
-- tenant/system admin) via public.is_safety_admin(). Every employee can raise an
-- SOS, see active alerts, and mark themselves safe.
-- =============================================================================

-- --- Enums -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname='eess_incident_type') then
    create type public.eess_incident_type as enum
      ('medical','fire','facility','active_threat','other');
  end if;
  if not exists (select 1 from pg_type where typname='eess_incident_status') then
    create type public.eess_incident_status as enum
      ('open','acknowledged','responding','resolved');
  end if;
  if not exists (select 1 from pg_type where typname='eess_severity') then
    create type public.eess_severity as enum ('info','warning','critical');
  end if;
  if not exists (select 1 from pg_type where typname='eess_checkin_status') then
    create type public.eess_checkin_status as enum ('safe','need_help');
  end if;
end$$;

-- --- Role helper -------------------------------------------------------------
create or replace function public.is_safety_admin() returns boolean
  language sql stable set search_path='' as $$
  select public.is_tenant_admin()
      or public.has_role('safety_admin')
      or public.has_role('system_admin');
$$;

-- --- A. Incidents (SOS & manual reports) -------------------------------------
create table if not exists public.eess_incidents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  reporter_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  incident_type   public.eess_incident_type not null default 'other',
  severity        public.eess_severity not null default 'critical',
  status          public.eess_incident_status not null default 'open',
  is_sos          boolean not null default false,
  note            text,
  location_text   text,
  lat             double precision,
  lng             double precision,
  photo_url       text,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by     uuid references public.profiles(id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_eess_incidents_tenant on public.eess_incidents(tenant_id, created_at desc);

-- --- B. Broadcasts (mass / geofenced alerts) --------------------------------
create table if not exists public.eess_broadcasts (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  created_by       uuid not null default auth.uid() references public.profiles(id) on delete set null,
  title            text not null,
  message          text not null,
  severity         public.eess_severity not null default 'warning',
  channels         text[] not null default '{push}',
  location_label   text,
  center_lat       double precision,
  center_lng       double precision,
  radius_m         integer,
  requires_checkin boolean not null default false,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
create index if not exists idx_eess_broadcasts_tenant on public.eess_broadcasts(tenant_id, created_at desc);

-- --- C. Check-ins (accountability) ------------------------------------------
create table if not exists public.eess_checkins (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  profile_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  broadcast_id uuid references public.eess_broadcasts(id) on delete cascade,
  status       public.eess_checkin_status not null,
  note         text,
  lat          double precision,
  lng          double precision,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_eess_checkins_tenant on public.eess_checkins(tenant_id, created_at desc);
-- One check-in per person per event (general check-ins, broadcast_id null, are unconstrained).
create unique index if not exists uq_eess_checkin_event
  on public.eess_checkins(broadcast_id, profile_id) where broadcast_id is not null;

-- --- Fill tenant_id from the actor's profile on insert ----------------------
create or replace function public.eess_fill_tenant()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.tenant_id is null then
    select tenant_id into new.tenant_id from public.profiles where id = auth.uid();
  end if;
  return new;
end; $$;

drop trigger if exists trg_eess_incidents_tenant on public.eess_incidents;
create trigger trg_eess_incidents_tenant before insert on public.eess_incidents
  for each row execute function public.eess_fill_tenant();
drop trigger if exists trg_eess_broadcasts_tenant on public.eess_broadcasts;
create trigger trg_eess_broadcasts_tenant before insert on public.eess_broadcasts
  for each row execute function public.eess_fill_tenant();
drop trigger if exists trg_eess_checkins_tenant on public.eess_checkins;
create trigger trg_eess_checkins_tenant before insert on public.eess_checkins
  for each row execute function public.eess_fill_tenant();

-- --- RLS --------------------------------------------------------------------
alter table public.eess_incidents enable row level security;
alter table public.eess_broadcasts enable row level security;
alter table public.eess_checkins enable row level security;

-- Incidents: a reporter sees their own; safety admins see all in the tenant.
drop policy if exists "eess_incidents_select_own" on public.eess_incidents;
create policy "eess_incidents_select_own" on public.eess_incidents for select to authenticated
  using (reporter_id = auth.uid());
drop policy if exists "eess_incidents_select_admin" on public.eess_incidents;
create policy "eess_incidents_select_admin" on public.eess_incidents for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_safety_admin());
drop policy if exists "eess_incidents_insert" on public.eess_incidents;
create policy "eess_incidents_insert" on public.eess_incidents for insert to authenticated
  with check (reporter_id = auth.uid() and tenant_id = public.current_tenant_id());
drop policy if exists "eess_incidents_admin_write" on public.eess_incidents;
create policy "eess_incidents_admin_write" on public.eess_incidents for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_safety_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_safety_admin());

-- Broadcasts: everyone in the tenant can read active alerts; safety admins write.
drop policy if exists "eess_broadcasts_select" on public.eess_broadcasts;
create policy "eess_broadcasts_select" on public.eess_broadcasts for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists "eess_broadcasts_admin_write" on public.eess_broadcasts;
create policy "eess_broadcasts_admin_write" on public.eess_broadcasts for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_safety_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_safety_admin());

-- Check-ins: a person manages their own; safety admins see the whole roster's status.
drop policy if exists "eess_checkins_select_own" on public.eess_checkins;
create policy "eess_checkins_select_own" on public.eess_checkins for select to authenticated
  using (profile_id = auth.uid());
drop policy if exists "eess_checkins_select_admin" on public.eess_checkins;
create policy "eess_checkins_select_admin" on public.eess_checkins for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_safety_admin());
drop policy if exists "eess_checkins_insert" on public.eess_checkins;
create policy "eess_checkins_insert" on public.eess_checkins for insert to authenticated
  with check (profile_id = auth.uid() and tenant_id = public.current_tenant_id());
drop policy if exists "eess_checkins_update_own" on public.eess_checkins;
create policy "eess_checkins_update_own" on public.eess_checkins for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- --- Storage bucket for SOS photo/video attachments -------------------------
insert into storage.buckets (id, name, public) values ('eess-media','eess-media', true)
on conflict (id) do nothing;
-- Public bucket serves objects by URL without a SELECT/listing policy (avoids
-- exposing a file listing of sensitive incident media). Only need insert.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='eess_media_insert') then
    create policy "eess_media_insert" on storage.objects for insert to authenticated with check (bucket_id = 'eess-media');
  end if;
end$$;

-- --- Register the module + enable it for Addax + set the brand logo ----------
insert into public.services_catalog (slug, name, description, icon, route_path, is_core, sort_order)
values ('emergency','Emergency Support','SOS alerts, mass broadcasts and real-time safety check-ins.','Siren','/emergency', false, 1)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description,
      icon = excluded.icon, route_path = excluded.route_path, sort_order = excluded.sort_order;

insert into public.tenant_services (tenant_id, service_id, is_active)
select t.id, s.id, true
from public.tenants t cross join public.services_catalog s
where t.slug = 'addax-petroleum' and s.slug = 'emergency'
on conflict (tenant_id, service_id) do update set is_active = true;

-- Brand logo for the Addax tenant (served as a static asset from /public).
update public.tenants
  set settings = jsonb_set(
        coalesce(settings, '{}'::jsonb),
        '{branding,logoUrl}',
        '"/addax-logo.svg"'::jsonb,
        true)
where slug = 'addax-petroleum';
