-- User-driven finalisation: once finalised the employee can no longer change
-- their booking (locked & green). Admin/campboss may still override.
alter table public.canteen_bookings
  add column if not exists finalized_at timestamptz;

create or replace function public.canteen_protect_prepared()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (old.prepared_at is not null or old.finalized_at is not null)
     and old.status <> 'cancelled'
     and (new.status = 'cancelled'
          or new.dish_id is distinct from old.dish_id
          or new.guest_count is distinct from old.guest_count)
     and not public.is_tenant_admin() then
    raise exception 'Your choice is finalised and can no longer be changed';
  end if;
  return new;
end;
$$;

drop view if exists public.canteen_reservations;
create view public.canteen_reservations
with (security_invoker = true) as
  select
    b.id as booking_id, b.tenant_id, b.service_date, b.meal_period, b.guest_count,
    b.status, b.prepared_at, b.finalized_at, b.created_at,
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
           b.status, b.prepared_at, b.finalized_at, b.created_at, p.full_name, p.email,
           d.name, k.name, k.kind;
