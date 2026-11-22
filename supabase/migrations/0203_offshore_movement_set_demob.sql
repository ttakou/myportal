-- "Set my demob date": someone on board with no planned demobilisation asks
-- for one, through the same endorsement and OIM decision. There is no
-- scheduled date to move, so it may be empty for this kind only.
alter table public.offshore_movement_requests drop constraint if exists offshore_movement_requests_kind_check;
alter table public.offshore_movement_requests
  add constraint offshore_movement_requests_kind_check
  check (kind in ('early_mob','late_mob','early_demob','late_demob','set_demob'));

alter table public.offshore_movement_requests alter column scheduled_date drop not null;

alter table public.offshore_movement_requests drop constraint if exists offshore_movement_requests_scheduled_check;
alter table public.offshore_movement_requests
  add constraint offshore_movement_requests_scheduled_check
  check ((kind = 'set_demob') = (scheduled_date is null));
