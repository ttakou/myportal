-- =============================================================================
-- Simplify meal entitlements to defined-period grants.
--
-- An entitlement is now simply: an employee + meals per working day + a start
-- and end date. Multiple grants per person are allowed (e.g. a 1-year onshore
-- entitlement plus a 1-week onshore-office stint for an offshore worker). The
-- effective allowance on any day is the SUM of the grants covering that day.
--
-- This replaces the permanent roster + separate visitor top-ups + monthly
-- auto-renewal. Expired grants are kept for history/traceability.
-- =============================================================================

alter table public.canteen_meal_entitlements add column if not exists starts_on date;
alter table public.canteen_meal_entitlements add column if not exists ends_on date;
alter table public.canteen_meal_entitlements add column if not exists reason text;

-- Backfill any pre-existing rows (none in real use yet) with a sane period.
update public.canteen_meal_entitlements
   set starts_on = coalesce(starts_on, current_date),
       ends_on   = coalesce(ends_on, current_date)
 where starts_on is null or ends_on is null;

alter table public.canteen_meal_entitlements alter column starts_on set not null;
alter table public.canteen_meal_entitlements alter column ends_on set not null;
alter table public.canteen_meal_entitlements
  drop constraint if exists cme_period_valid;
alter table public.canteen_meal_entitlements
  add constraint cme_period_valid check (ends_on >= starts_on);

-- Multiple period grants per person are now allowed.
alter table public.canteen_meal_entitlements
  drop constraint if exists canteen_meal_entitlements_tenant_id_profile_id_key;

-- Active-ness and renewal are now derived from the date range.
alter table public.canteen_meal_entitlements drop column if exists is_active;
alter table public.canteen_meal_entitlements drop column if exists last_renewed_on;

create index if not exists idx_cme_period
  on public.canteen_meal_entitlements(profile_id, starts_on, ends_on);

-- Effective meals on a date = sum of grants covering it (working days only).
create or replace function public.canteen_effective_meals(p_profile_id uuid, p_date date)
returns integer language sql stable security definer set search_path = '' as $$
  select case
    when not public.canteen_is_working_day(p_date) then 0
    else coalesce((
      select sum(e.daily_meals)::integer
        from public.canteen_meal_entitlements e
       where e.profile_id = p_profile_id
         and p_date between e.starts_on and e.ends_on
    ), 0)
  end;
$$;
revoke execute on function public.canteen_effective_meals(uuid, date)
  from public, anon, authenticated;

-- Remove the superseded top-up, renewal and monthly-cron machinery.
drop function if exists public.canteen_run_monthly_renewal();
drop table if exists public.canteen_meal_renewals;
drop table if exists public.canteen_meal_entitlement_extras;
