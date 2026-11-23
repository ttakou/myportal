-- Crews and manifests travel by boat unless told otherwise.
alter table public.offshore_crews alter column transport_mode set default 'BOAT';
alter table public.offshore_manifests alter column transport_mode set default 'boat';
update public.offshore_crews set transport_mode = 'BOAT' where transport_mode is null or transport_mode = '';
update public.offshore_manifests set transport_mode = 'boat'
  where scheduled_date >= current_date and status <> 'cancelled' and (transport_mode is null or transport_mode = '');
