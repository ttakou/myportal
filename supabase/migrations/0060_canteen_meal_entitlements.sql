-- =============================================================================
-- Canteen meal entitlements.
--
-- HR defines which employees are entitled to a meal on each WORKING DAY
-- (Mon–Fri), with a default of one meal/day. When an employee hosts a visitor
-- for a period, HR adds a date-ranged "extra" that tops up their daily count
-- for the duration only. Canteen staff record each meal taken (a redemption),
-- which is checked against the day's effective entitlement.
--
-- The entitlement is a DAILY allowance: unused meals never roll over — each day
-- starts fresh. A monthly cron (canteen_run_monthly_renewal) re-affirms active
-- entitlements and writes an audit row so HR can see the renewal happened.
-- =============================================================================

-- 1. Standing roster: who is entitled, and to how many meals per working day. ---
create table if not exists public.canteen_meal_entitlements (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  daily_meals     smallint not null default 1 check (daily_meals between 0 and 10),
  is_active       boolean not null default true,
  notes           text,
  granted_by      uuid references public.profiles(id) on delete set null,
  last_renewed_on date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, profile_id)
);
create index if not exists idx_cme_profile on public.canteen_meal_entitlements(profile_id);

-- 2. Visitor extras: a date-ranged top-up attached to a host employee. ----------
create table if not exists public.canteen_meal_entitlement_extras (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  extra_meals  smallint not null check (extra_meals between 1 and 50),
  reason       text,
  starts_on    date not null,
  ends_on      date not null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists idx_cme_extras_lookup
  on public.canteen_meal_entitlement_extras(profile_id, starts_on, ends_on);

-- 3. Redemptions: one row per meal actually taken. -----------------------------
create table if not exists public.canteen_meal_redemptions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  redeemed_on  date not null default current_date,
  redeemed_by  uuid references public.profiles(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_cme_redemptions_day
  on public.canteen_meal_redemptions(tenant_id, redeemed_on);
create index if not exists idx_cme_redemptions_profile_day
  on public.canteen_meal_redemptions(profile_id, redeemed_on);

-- 4. Monthly renewal audit. ----------------------------------------------------
create table if not exists public.canteen_meal_renewals (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  period_month date not null,
  active_count integer not null default 0,
  run_at       timestamptz not null default now(),
  unique (tenant_id, period_month)
);

-- Fill tenant_id from the referenced profile (mirrors profile_roles_fill_tenant).
create or replace function public.canteen_entitlement_fill_tenant()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.tenant_id is null then
    select tenant_id into new.tenant_id from public.profiles where id = new.profile_id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_cme_fill_tenant on public.canteen_meal_entitlements;
create trigger trg_cme_fill_tenant before insert on public.canteen_meal_entitlements
  for each row execute function public.canteen_entitlement_fill_tenant();
drop trigger if exists trg_cme_extras_fill_tenant on public.canteen_meal_entitlement_extras;
create trigger trg_cme_extras_fill_tenant before insert on public.canteen_meal_entitlement_extras
  for each row execute function public.canteen_entitlement_fill_tenant();
drop trigger if exists trg_cme_redemptions_fill_tenant on public.canteen_meal_redemptions;
create trigger trg_cme_redemptions_fill_tenant before insert on public.canteen_meal_redemptions
  for each row execute function public.canteen_entitlement_fill_tenant();

drop trigger if exists trg_cme_updated_at on public.canteen_meal_entitlements;
create trigger trg_cme_updated_at before update on public.canteen_meal_entitlements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- Working day = Monday–Friday.
create or replace function public.canteen_is_working_day(d date)
returns boolean language sql immutable set search_path = '' as $$
  select extract(isodow from d) between 1 and 5;
$$;

-- Effective meals a profile is entitled to on a given date: the active base
-- allowance plus any overlapping visitor extras. Zero on weekends.
create or replace function public.canteen_effective_meals(p_profile_id uuid, p_date date)
returns integer language sql stable security definer set search_path = '' as $$
  select case
    when not public.canteen_is_working_day(p_date) then 0
    else
      coalesce((
        select e.daily_meals from public.canteen_meal_entitlements e
        where e.profile_id = p_profile_id and e.is_active
      ), 0)
      + coalesce((
        select sum(x.extra_meals)::integer from public.canteen_meal_entitlement_extras x
        where x.profile_id = p_profile_id and p_date between x.starts_on and x.ends_on
      ), 0)
  end;
$$;

-- Record a meal taken. Canteen staff only; guards against exceeding the day's
-- effective entitlement. Runs as definer so the count check can't be bypassed.
create or replace function public.canteen_redeem_meal(
  p_profile_id uuid,
  p_date date default current_date,
  p_note text default null
)
returns public.canteen_meal_redemptions
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant    uuid;
  v_effective integer;
  v_used      integer;
  v_row       public.canteen_meal_redemptions;
begin
  if not public.is_canteen_staff() then
    raise exception 'Only canteen staff can record meals.' using errcode = '42501';
  end if;

  select tenant_id into v_tenant from public.profiles where id = p_profile_id;
  if v_tenant is null then
    raise exception 'Unknown employee.';
  end if;
  if not public.is_super_admin() and v_tenant <> public.current_tenant_id() then
    raise exception 'Employee belongs to a different organisation.' using errcode = '42501';
  end if;

  v_effective := public.canteen_effective_meals(p_profile_id, p_date);
  if v_effective <= 0 then
    raise exception 'No meal entitlement for this date.';
  end if;

  select count(*) into v_used from public.canteen_meal_redemptions
   where profile_id = p_profile_id and redeemed_on = p_date;
  if v_used >= v_effective then
    raise exception 'Daily meal entitlement already used (% of %).', v_used, v_effective;
  end if;

  insert into public.canteen_meal_redemptions (tenant_id, profile_id, redeemed_on, redeemed_by, note)
  values (v_tenant, p_profile_id, p_date, auth.uid(), p_note)
  returning * into v_row;
  return v_row;
end; $$;
grant execute on function public.canteen_redeem_meal(uuid, date, text) to authenticated;

-- Undo a redemption (staff correction).
create or replace function public.canteen_unredeem_meal(p_redemption_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid;
begin
  if not public.is_canteen_staff() then
    raise exception 'Only canteen staff can undo meals.' using errcode = '42501';
  end if;
  select tenant_id into v_tenant from public.canteen_meal_redemptions where id = p_redemption_id;
  if v_tenant is null then return; end if;
  if not public.is_super_admin() and v_tenant <> public.current_tenant_id() then
    raise exception 'Redemption belongs to a different organisation.' using errcode = '42501';
  end if;
  delete from public.canteen_meal_redemptions where id = p_redemption_id;
end; $$;
grant execute on function public.canteen_unredeem_meal(uuid) to authenticated;

-- Monthly renewal: re-affirm every active entitlement and log it per tenant.
-- Invoked by the platform cron (service role); not callable by tenant users.
create or replace function public.canteen_run_monthly_renewal()
returns table (tenant_id uuid, active_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', current_date)::date;
begin
  update public.canteen_meal_entitlements e
     set last_renewed_on = v_month, updated_at = now()
   where e.is_active;

  return query
  insert into public.canteen_meal_renewals (tenant_id, period_month, active_count)
  select e.tenant_id, v_month, count(*)::integer
    from public.canteen_meal_entitlements e
   where e.is_active
   group by e.tenant_id
  on conflict (tenant_id, period_month) do update
     set active_count = excluded.active_count, run_at = now()
  returning canteen_meal_renewals.tenant_id, canteen_meal_renewals.active_count;
end; $$;
revoke all on function public.canteen_run_monthly_renewal() from public;
grant execute on function public.canteen_run_monthly_renewal() to service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.canteen_meal_entitlements        enable row level security;
alter table public.canteen_meal_entitlement_extras  enable row level security;
alter table public.canteen_meal_redemptions         enable row level security;
alter table public.canteen_meal_renewals            enable row level security;

-- Roster: HR & canteen staff read all in-tenant; employees read their own. HR writes.
drop policy if exists "cme_select" on public.canteen_meal_entitlements;
create policy "cme_select" on public.canteen_meal_entitlements for select to authenticated
  using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and (public.is_hr() or public.is_canteen_staff() or profile_id = auth.uid()))
  );
drop policy if exists "cme_write" on public.canteen_meal_entitlements;
create policy "cme_write" on public.canteen_meal_entitlements for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_hr()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_hr()));

-- Extras: same readership; HR writes.
drop policy if exists "cme_extras_select" on public.canteen_meal_entitlement_extras;
create policy "cme_extras_select" on public.canteen_meal_entitlement_extras for select to authenticated
  using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and (public.is_hr() or public.is_canteen_staff() or profile_id = auth.uid()))
  );
drop policy if exists "cme_extras_write" on public.canteen_meal_entitlement_extras;
create policy "cme_extras_write" on public.canteen_meal_entitlement_extras for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_hr()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_hr()));

-- Redemptions: staff/HR/finance read all in-tenant; employees read their own.
-- Writes go through the RPCs above, but staff may also write directly.
drop policy if exists "cme_redemptions_select" on public.canteen_meal_redemptions;
create policy "cme_redemptions_select" on public.canteen_meal_redemptions for select to authenticated
  using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and (public.is_canteen_staff() or public.is_hr() or public.is_finance()
             or profile_id = auth.uid()))
  );
drop policy if exists "cme_redemptions_write" on public.canteen_meal_redemptions;
create policy "cme_redemptions_write" on public.canteen_meal_redemptions for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_canteen_staff()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_canteen_staff()));

-- Renewal audit: HR & finance read; writes only via service-role cron.
drop policy if exists "cme_renewals_select" on public.canteen_meal_renewals;
create policy "cme_renewals_select" on public.canteen_meal_renewals for select to authenticated
  using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id() and (public.is_hr() or public.is_finance()))
  );
