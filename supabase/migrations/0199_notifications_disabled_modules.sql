-- A module the tenant has switched off sends nothing. The app checks this
-- before it notifies anyone; this trigger covers the jobs that write to the
-- bell from the database itself (savings nudges, certificate expiry), so a
-- disabled module cannot reach people either way. A notification belongs to
-- the module whose page it links to; emergency alerts and links to shared
-- pages (dashboard, account) are never held back.
create or replace function private.skip_notifications_of_disabled_modules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seg text;
begin
  if new.category = 'emergency' or new.url is null or left(new.url, 1) <> '/' then
    return new;
  end if;
  seg := split_part(split_part(split_part(substr(new.url, 2), '?', 1), '#', 1), '/', 1);
  if exists (
    select 1
    from public.tenant_services ts
    join public.services_catalog c on c.id = ts.service_id
    where ts.tenant_id = new.tenant_id
      and c.route_path = '/' || seg
      and not c.is_core
      and not ts.is_active
  ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_skip_disabled_modules on public.notifications;
create trigger notifications_skip_disabled_modules
  before insert on public.notifications
  for each row execute function private.skip_notifications_of_disabled_modules();
