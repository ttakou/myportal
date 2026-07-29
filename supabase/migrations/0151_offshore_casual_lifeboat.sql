-- Offshore Phase 2: lifeboat allocation for casual/day visitors + manual
-- per-person lifeboat override.
--
-- Casual visitors (short, often day-only, no bed) previously existed only as
-- catering rows — invisible to POB and the muster roll-call. They now become
-- lightweight onboard visit requests carrying a lifeboat directly (they have no
-- cabin to inherit one from).
--
-- Lifeboat precedence stays "the room drives it" (a property of the cabin), but
-- an operator can now override a single person's station manually:
--   staff:    trips.lifeboat_override ?? room.lifeboat ?? trips.lifeboat (legacy)
--   visitor:  visit.lifeboat (manual/direct) ?? allocated room.lifeboat

alter table public.offshore_visit_requests
  add column if not exists lifeboat  text,
  add column if not exists is_casual boolean not null default false;

alter table public.offshore_trips
  add column if not exists lifeboat_override text;
