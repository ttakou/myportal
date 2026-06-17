-- 0086: Performance — index the appraisals (cycle_id, status) access path and
-- the offshore_trips foreign keys used in per-row PostgREST lateral embeds.

create index if not exists appraisals_cycle_status_idx
  on public.appraisals (cycle_id, status);

create index if not exists offshore_trips_profile_id_idx      on public.offshore_trips (profile_id);
create index if not exists offshore_trips_crew_id_idx         on public.offshore_trips (crew_id);
create index if not exists offshore_trips_room_id_idx         on public.offshore_trips (room_id);
create index if not exists offshore_trips_installation_id_idx on public.offshore_trips (installation_id);
create index if not exists offshore_trips_flight_id_idx       on public.offshore_trips (flight_id);
create index if not exists offshore_trips_hse_cleared_by_idx  on public.offshore_trips (hse_cleared_by);
