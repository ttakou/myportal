-- Track collection (pickup) and expose lunch history with derived outcome.
alter table public.canteen_bookings add column if not exists collected_at timestamptz;

drop view if exists public.canteen_reservations;
create view public.canteen_reservations with (security_invoker = true) as
  select b.id as booking_id, b.tenant_id, b.service_date, b.meal_period, b.guest_count,
    b.status, b.prepared_at, b.finalized_at, b.collected_at, b.created_at,
    p.full_name as person_name, p.email as person_email,
    d.name as dish_name, k.name as kitchen_name, k.kind as kitchen_kind,
    coalesce(string_agg(o.name, ', ' order by g.sort_order, o.sort_order), '') as options
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
           p.full_name, p.email, d.name, k.name, k.kind;

create or replace view public.canteen_lunch_history with (security_invoker = true) as
  select b.id as booking_id, b.tenant_id, b.profile_id, b.service_date, b.meal_period,
    b.status, b.finalized_at, b.prepared_at, b.collected_at, b.guest_count,
    d.name as dish_name, k.name as kitchen_name,
    coalesce(string_agg(o.name, ', ' order by g.sort_order, o.sort_order), '') as options,
    case when b.status='cancelled' then 'cancelled'
         when b.collected_at is not null then 'collected'
         when b.service_date < current_date then 'missed'
         else 'booked' end as outcome
  from public.canteen_bookings b
  join public.canteen_dishes d on d.id = b.dish_id
  join public.canteen_kitchens k on k.id = b.kitchen_id
  left join public.canteen_booking_options bo on bo.booking_id = b.id
  left join public.canteen_options o on o.id = bo.option_id
  left join public.canteen_option_groups g on g.id = o.group_id
  group by b.id, b.tenant_id, b.profile_id, b.service_date, b.meal_period, b.status,
           b.finalized_at, b.prepared_at, b.collected_at, b.guest_count, d.name, k.name;
