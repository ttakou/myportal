-- Who rejected or cancelled a staff trip, and when. HSE clearance already
-- records who approved a trip; a rejection only set the status, so the OIM's
-- approvals log could not say who turned a request down. Past rejections are
-- taken from the audit log.
alter table public.offshore_trips
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancelled_at timestamptz;

create index if not exists idx_offshore_trips_cancelled_by on public.offshore_trips (cancelled_by);

update public.offshore_trips t
set cancelled_by = a.actor_id, cancelled_at = a.at
from (
  select distinct on (row_id) row_id, actor_id, at
  from public.audit_log
  where table_name = 'offshore_trips' and op = 'UPDATE' and changes->'status'->>'to' = 'cancelled'
  order by row_id, at desc
) a
where a.row_id = t.id::text and t.status = 'cancelled' and t.cancelled_at is null;
