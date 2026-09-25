-- Crew change day manifests: one MOB and one DEMOB manifest per installation
-- for every day a crew changes, listing everyone due that day across all
-- crews. `kind` tells them from the per-crew manifests built by hand; the
-- nightly offshore job prepares the day manifests ahead, and the unique
-- index keeps it (or a double click) from making two for the same run.
alter table public.offshore_manifests
  add column if not exists kind text not null default 'crew' check (kind in ('crew', 'day'));

create unique index if not exists offshore_manifests_day_run
  on public.offshore_manifests (tenant_id, scheduled_date, direction, coalesce(installation_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where kind = 'day' and status <> 'cancelled';
