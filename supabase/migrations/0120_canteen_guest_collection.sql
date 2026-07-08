-- Per-visitor collection. Until now a booking's visitor plates (guest_count)
-- were assumed handed over together with the host's own plate at a single
-- collection event (collected_at). The serving point could not check a visitor
-- off as they arrived, and reports counted one meal per booking — visitor
-- plates were served but never tallied as meals or costed.
--
-- collected_guest_count records how many visitor plates have actually been
-- handed over so far (0..guest_count), independently of the host's own plate.
-- A booking is fully served when collected_at is set and
-- collected_guest_count = guest_count.
alter table public.canteen_bookings
  add column if not exists collected_guest_count integer not null default 0;

alter table public.canteen_bookings
  drop constraint if exists canteen_bookings_collected_guests_chk;
alter table public.canteen_bookings
  add constraint canteen_bookings_collected_guests_chk
  check (collected_guest_count >= 0 and collected_guest_count <= guest_count);

comment on column public.canteen_bookings.collected_guest_count is
  'Visitor plates handed over so far (0..guest_count). The host''s own plate is tracked by collected_at.';

-- Surface the new counter on the two read views the app uses. create-or-replace
-- keeps the existing columns/order and appends the new one at the end.
drop view if exists public.canteen_reservations;
create view public.canteen_reservations with (security_invoker = true) as
  select b.id as booking_id, b.tenant_id, b.service_date, b.meal_period, b.guest_count,
    b.status, b.prepared_at, b.finalized_at, b.collected_at, b.created_at,
    p.full_name as person_name, p.email as person_email,
    d.name as dish_name, k.name as kitchen_name, k.kind as kitchen_kind,
    coalesce(string_agg(o.name, ', ' order by g.sort_order, o.sort_order), '') as options,
    b.collected_guest_count
  from public.canteen_bookings b
  join public.profiles p on p.id = b.profile_id
  join public.canteen_dishes d on d.id = b.dish_id
  join public.canteen_kitchens k on k.id = b.kitchen_id
  left join public.canteen_booking_options bo on bo.booking_id = b.id
  left join public.canteen_options o on o.id = bo.option_id
  left join public.canteen_option_groups g on g.id = o.group_id
  where b.status <> 'cancelled'
  group by b.id, b.tenant_id, b.service_date, b.meal_period, b.guest_count,
           b.status, b.prepared_at, b.finalized_at, b.collected_at, b.created_at,
           p.full_name, p.email, d.name, k.name, k.kind, b.collected_guest_count;

create or replace view public.canteen_lunch_history with (security_invoker = true) as
  select b.id as booking_id, b.tenant_id, b.profile_id, b.service_date, b.meal_period,
    b.status, b.finalized_at, b.prepared_at, b.collected_at, b.guest_count,
    d.name as dish_name, k.name as kitchen_name,
    coalesce(string_agg(o.name, ', ' order by g.sort_order, o.sort_order), '') as options,
    case when b.status='cancelled' then 'cancelled'
         when b.collected_at is not null then 'collected'
         when b.service_date < current_date then 'missed'
         else 'booked' end as outcome,
    b.collected_guest_count
  from public.canteen_bookings b
  join public.canteen_dishes d on d.id = b.dish_id
  join public.canteen_kitchens k on k.id = b.kitchen_id
  left join public.canteen_booking_options bo on bo.booking_id = b.id
  left join public.canteen_options o on o.id = bo.option_id
  left join public.canteen_option_groups g on g.id = o.group_id
  group by b.id, b.tenant_id, b.profile_id, b.service_date, b.meal_period, b.status,
           b.finalized_at, b.prepared_at, b.collected_at, b.guest_count, d.name, k.name,
           b.collected_guest_count;
