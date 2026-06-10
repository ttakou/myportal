-- Once a meal is marked ready for collection (prepared_at set), the employee can
-- no longer cancel, switch dish, or change guests. The campboss (tenant admin)
-- can still override.
create or replace function public.canteen_protect_prepared()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.prepared_at is not null
     and old.status <> 'cancelled'
     and (new.status = 'cancelled'
          or new.dish_id is distinct from old.dish_id
          or new.guest_count is distinct from old.guest_count)
     and not public.is_tenant_admin() then
    raise exception 'This meal is ready for collection and can no longer be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_canteen_protect_prepared on public.canteen_bookings;
create trigger trg_canteen_protect_prepared
  before update on public.canteen_bookings
  for each row execute function public.canteen_protect_prepared();
