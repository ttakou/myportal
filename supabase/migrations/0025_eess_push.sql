-- =============================================================================
-- EESS — Web Push delivery
--
-- Adds the plumbing for *real* alert delivery over the Web Push protocol:
--   * public.eess_push_subscriptions — one row per browser/device a user has
--     opted in from. Each employee manages only their own subscriptions (RLS).
--   * public.eess_delivery_log       — an audit trail of every fan-out so the
--     command center can show how many people an alert actually reached.
--
-- The fan-out itself runs server-side with the service-role key (see
-- src/lib/eess-notify.ts), which bypasses RLS — so these policies only need to
-- cover the employee-facing opt-in/opt-out and the safety-admin read of logs.
-- =============================================================================

-- --- Push subscriptions ------------------------------------------------------
create table if not exists public.eess_push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  profile_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  is_active       boolean not null default true,
  last_success_at timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_eess_push_subs_tenant
  on public.eess_push_subscriptions(tenant_id) where is_active;
create index if not exists idx_eess_push_subs_profile
  on public.eess_push_subscriptions(profile_id);

-- --- Delivery log ------------------------------------------------------------
create table if not exists public.eess_delivery_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  source_type text not null check (source_type in ('incident','broadcast')),
  source_id   uuid not null,
  channel     text not null default 'push',
  audience    text not null,            -- 'responders' | 'all'
  recipients  integer not null default 0,  -- distinct people targeted
  sent        integer not null default 0,  -- subscriptions attempted
  delivered   integer not null default 0,
  failed      integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_eess_delivery_tenant
  on public.eess_delivery_log(tenant_id, created_at desc);

-- --- Fill tenant_id from the actor's profile on insert (reuse the helper) -----
drop trigger if exists trg_eess_push_subs_tenant on public.eess_push_subscriptions;
create trigger trg_eess_push_subs_tenant before insert on public.eess_push_subscriptions
  for each row execute function public.eess_fill_tenant();

-- --- RLS ---------------------------------------------------------------------
alter table public.eess_push_subscriptions enable row level security;
alter table public.eess_delivery_log enable row level security;

-- Subscriptions: a person manages only their own device registrations.
drop policy if exists "eess_push_subs_select_own" on public.eess_push_subscriptions;
create policy "eess_push_subs_select_own" on public.eess_push_subscriptions for select to authenticated
  using (profile_id = auth.uid());
drop policy if exists "eess_push_subs_insert" on public.eess_push_subscriptions;
create policy "eess_push_subs_insert" on public.eess_push_subscriptions for insert to authenticated
  with check (profile_id = auth.uid() and tenant_id = public.current_tenant_id());
drop policy if exists "eess_push_subs_update_own" on public.eess_push_subscriptions;
create policy "eess_push_subs_update_own" on public.eess_push_subscriptions for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists "eess_push_subs_delete_own" on public.eess_push_subscriptions;
create policy "eess_push_subs_delete_own" on public.eess_push_subscriptions for delete to authenticated
  using (profile_id = auth.uid());

-- Delivery log: safety admins read their tenant's audit trail. Inserts happen
-- server-side via the service-role key, so no insert policy is required.
drop policy if exists "eess_delivery_select_admin" on public.eess_delivery_log;
create policy "eess_delivery_select_admin" on public.eess_delivery_log for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_safety_admin());

-- --- Late-arriving location for an incident ----------------------------------
-- The SOS flow fires the alert instantly, then enriches it with GPS (or a typed
-- description) the moment that's available. This SECURITY DEFINER helper lets a
-- reporter set ONLY the location columns on their own incident, without opening
-- a broad UPDATE policy on the table.
create or replace function public.eess_set_incident_location(
  p_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_text text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.eess_incidents
     set lat = coalesce(p_lat, lat),
         lng = coalesce(p_lng, lng),
         location_text = coalesce(p_text, location_text),
         updated_at = now()
   where id = p_id and reporter_id = auth.uid();
end; $$;
-- Lock down: revoke from PUBLIC *and* the anon role (Supabase grants EXECUTE to
-- anon directly via default privileges, so a bare `revoke ... from public` does
-- not remove it). Only signed-in users may enrich their own incident's location.
revoke all on function public.eess_set_incident_location(uuid, double precision, double precision, text) from public;
revoke all on function public.eess_set_incident_location(uuid, double precision, double precision, text) from anon;
grant execute on function public.eess_set_incident_location(uuid, double precision, double precision, text) to authenticated;
