-- =============================================================================
-- Fleet management: driver duty status + vehicle lifecycle status.
-- =============================================================================

alter table public.transport_drivers
  add column if not exists on_duty boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_type where typname='vehicle_status') then
    create type public.vehicle_status as enum ('active','maintenance','retired');
  end if;
end$$;

alter table public.transport_vehicles
  add column if not exists status public.vehicle_status not null default 'active';

-- Backfill: any vehicle previously deactivated becomes 'retired'.
update public.transport_vehicles set status = 'retired' where is_active = false;

-- A driver can flip their own duty status without broad table write access.
create or replace function public.set_driver_duty(p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.transport_drivers
     set on_duty = p_on
   where profile_id = auth.uid();
end;
$$;
revoke execute on function public.set_driver_duty(boolean) from public, anon;
grant execute on function public.set_driver_duty(boolean) to authenticated;
