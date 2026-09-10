-- Canteen: the site clock, dish capacity that holds, a dish on each piece
-- of feedback, personal allergies, and a log for the nudges the jobs send.
--
-- 1) The cutoff and "today" ran on UTC: a 10:00 cutoff closed at 11:00
--    site time, and between midnight and 01:00 the menu showed yesterday.
--    site_today() / site_hour() give the Africa/Douala clock to SQL.
-- 2) A dish's capacity was recorded but never checked. canteen_book now
--    refuses a booking that would exceed it, counting plates (host +
--    guests) with a definer-rights helper so the count is not hidden by
--    the caller's own row visibility.
-- 3) canteen_feedback.dish_id, so ratings rank dishes.
-- 4) canteen_diet_profiles: a person's allergens, for the menu warning.
-- 5) canteen_notice_log: what the jobs already sent, so a reminder goes
--    once.

create or replace function public.site_today() returns date
  language sql stable set search_path = '' as $$ select (now() at time zone 'Africa/Douala')::date $$;
create or replace function public.site_hour() returns integer
  language sql stable set search_path = '' as $$ select extract(hour from (now() at time zone 'Africa/Douala'))::int $$;

-- Plates committed on a dish, everyone's, for the capacity check and the menu's "N left".
create or replace function public.canteen_dish_plates(p_dish uuid, p_except uuid default null)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(1 + b.guest_count), 0)::int
    from public.canteen_bookings b
   where b.dish_id = p_dish and b.status <> 'cancelled'
     and (p_except is null or b.profile_id <> p_except);
$$;
revoke all on function public.canteen_dish_plates(uuid, uuid) from public, anon;
grant execute on function public.canteen_dish_plates(uuid, uuid) to authenticated;

create or replace function public.canteen_dish_plates_on(p_date date)
returns table(dish_id uuid, plates integer) language sql stable security definer set search_path = '' as $$
  select b.dish_id, coalesce(sum(1 + b.guest_count), 0)::int
    from public.canteen_bookings b
   where b.service_date = p_date and b.status <> 'cancelled'
     and b.tenant_id = public.current_tenant_id()
   group by b.dish_id;
$$;
revoke all on function public.canteen_dish_plates_on(date) from public, anon;
grant execute on function public.canteen_dish_plates_on(date) to authenticated;

create or replace function public.canteen_book(
  p_dish_id uuid, p_guest_count integer default 0,
  p_guest_names text[] default '{}', p_option_ids uuid[] default '{}'
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_dish public.canteen_dishes%rowtype; v_uid uuid := auth.uid(); v_booking uuid; g record; v_cutoff integer;
  v_guests integer := greatest(0, least(10, coalesce(p_guest_count, 0))); v_plates integer;
begin
  if not exists (select 1 from public.profiles where id = v_uid and lunch_eligible and is_active) then
    raise exception 'You are not eligible for lunch booking. Contact HR.';
  end if;
  select * into v_dish from public.canteen_dishes where id = p_dish_id;
  if not found or not v_dish.is_active then raise exception 'Dish is not available'; end if;
  if not v_dish.available then raise exception 'This dish is currently unavailable'; end if;

  select (ts.settings ->> 'cutoff_hour')::int into v_cutoff
  from public.tenant_services ts join public.services_catalog sc on sc.id = ts.service_id
  where sc.slug = 'canteen' and ts.tenant_id = v_dish.tenant_id;
  if v_cutoff is not null and v_dish.service_date = public.site_today() and public.site_hour() >= v_cutoff then
    raise exception 'Booking for today closed at %:00', v_cutoff;
  end if;
  if v_dish.service_date < public.site_today() then
    raise exception 'That day has passed.';
  end if;

  -- Capacity, in plates, everyone's except the caller's own booking on this
  -- dish (it is replaced below).
  if v_dish.capacity is not null then
    v_plates := public.canteen_dish_plates(p_dish_id, v_uid);
    if v_plates + 1 + v_guests > v_dish.capacity then
      raise exception 'This dish is fully booked (% plates).', v_dish.capacity;
    end if;
  end if;

  if exists (select 1 from unnest(coalesce(p_option_ids, '{}')) as u(oid)
    where u.oid not in (select o.id from public.canteen_options o
      join public.canteen_option_groups grp on grp.id = o.group_id
      where grp.dish_id = p_dish_id and o.is_active))
  then raise exception 'One or more options are invalid for this dish'; end if;

  for g in
    select grp.name, grp.min_select, grp.max_select,
      (select count(*) from public.canteen_options o2 where o2.group_id = grp.id and o2.is_active) as opt_count,
      (select count(*) from unnest(coalesce(p_option_ids,'{}')) as u(oid)
         join public.canteen_options o on o.id = u.oid where o.group_id = grp.id) as chosen
    from public.canteen_option_groups grp where grp.dish_id = p_dish_id
  loop
    if g.opt_count = 0 then continue; end if;
    if g.chosen < g.min_select then raise exception 'Choose at least % option(s) for %', g.min_select, g.name; end if;
    if g.chosen > g.max_select then raise exception 'Choose at most % option(s) for %', g.max_select, g.name; end if;
  end loop;

  update public.canteen_bookings set status = 'cancelled'
   where profile_id = v_uid and service_date = v_dish.service_date
     and meal_period = v_dish.meal_period and status <> 'cancelled';
  insert into public.canteen_bookings (profile_id, dish_id, guest_count, guest_names)
  values (v_uid, p_dish_id, v_guests, coalesce(p_guest_names, '{}'))
  returning id into v_booking;
  if array_length(p_option_ids, 1) is not null then
    insert into public.canteen_booking_options (booking_id, option_id)
    select v_booking, u.oid from unnest(p_option_ids) as u(oid);
  end if;
  return v_booking;
end; $$;

-- "Missed" on the site's calendar, not UTC's. Same columns in the same
-- order as before (a view cannot drop or reorder columns), with the dish
-- id appended for the dish ranking.
create or replace view public.canteen_lunch_history with (security_invoker = true) as
  select b.id as booking_id, b.tenant_id, b.profile_id, b.service_date, b.meal_period,
    b.status, b.finalized_at, b.prepared_at, b.collected_at, b.guest_count,
    d.name as dish_name, k.name as kitchen_name,
    coalesce(string_agg(o.name, ', ' order by g.sort_order, o.sort_order), '') as options,
    case when b.status='cancelled' then 'cancelled'
         when b.collected_at is not null then 'collected'
         when b.service_date < public.site_today() then 'missed'
         else 'booked' end as outcome,
    b.collected_guest_count,
    b.dish_id
  from public.canteen_bookings b
  join public.canteen_dishes d on d.id = b.dish_id
  join public.canteen_kitchens k on k.id = b.kitchen_id
  left join public.canteen_booking_options bo on bo.booking_id = b.id
  left join public.canteen_options o on o.id = bo.option_id
  left join public.canteen_option_groups g on g.id = o.group_id
  group by b.id, b.tenant_id, b.profile_id, b.service_date, b.meal_period, b.status,
           b.finalized_at, b.prepared_at, b.collected_at, b.guest_count, d.name, k.name,
           b.collected_guest_count, b.dish_id;

-- Feedback names its dish.
alter table public.canteen_feedback
  add column if not exists dish_id uuid references public.canteen_dishes(id) on delete set null;
create index if not exists idx_canteen_feedback_dish on public.canteen_feedback (dish_id) where dish_id is not null;

-- Personal allergies.
create table if not exists public.canteen_diet_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  allergens text[] not null default '{}',
  notes text,
  updated_at timestamptz not null default now()
);
alter table public.canteen_diet_profiles enable row level security;
drop policy if exists canteen_diet_own on public.canteen_diet_profiles;
create policy canteen_diet_own on public.canteen_diet_profiles for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and tenant_id = (select public.current_tenant_id()));
drop policy if exists canteen_diet_kitchen on public.canteen_diet_profiles;
create policy canteen_diet_kitchen on public.canteen_diet_profiles for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and ((select public.is_tenant_admin())
      or private.uid_has_role('canteen_manager'::public.functional_role)
      or private.uid_has_role('canteen_staff'::public.functional_role))
  );

-- What the jobs already sent.
create table if not exists public.canteen_notice_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null,
  service_date date not null,
  profile_id uuid references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now()
);
create unique index if not exists canteen_notice_log_once
  on public.canteen_notice_log (tenant_id, kind, service_date, coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.canteen_notice_log enable row level security;
