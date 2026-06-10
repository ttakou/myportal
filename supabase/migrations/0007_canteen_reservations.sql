-- Pack-prep tracking + a per-person reservation view for the campboss.
alter table public.canteen_bookings
  add column if not exists prepared_at timestamptz;

-- Per-person reservations (who reserved what, with their composed choice).
-- security_invoker => the campboss (tenant admin) sees all tenant reservations;
-- a regular user would only see their own (via the bookings RLS).
create or replace view public.canteen_reservations
with (security_invoker = true) as
  select
    b.id            as booking_id,
    b.tenant_id,
    b.service_date,
    b.meal_period,
    b.guest_count,
    b.status,
    b.prepared_at,
    b.created_at,
    p.full_name     as person_name,
    p.email         as person_email,
    d.name          as dish_name,
    k.name          as kitchen_name,
    k.kind          as kitchen_kind,
    coalesce(
      string_agg(o.name, ', ' order by g.sort_order, o.sort_order),
      ''
    )               as options
  from public.canteen_bookings b
  join public.profiles p        on p.id = b.profile_id
  join public.canteen_dishes d  on d.id = b.dish_id
  join public.canteen_kitchens k on k.id = b.kitchen_id
  left join public.canteen_booking_options bo on bo.booking_id = b.id
  left join public.canteen_options o          on o.id = bo.option_id
  left join public.canteen_option_groups g    on g.id = o.group_id
  where b.status <> 'cancelled'
  group by b.id, b.tenant_id, b.service_date, b.meal_period, b.guest_count,
           b.status, b.prepared_at, b.created_at, p.full_name, p.email,
           d.name, k.name, k.kind;
