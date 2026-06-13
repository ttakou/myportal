-- =============================================================================
-- Lifeboat / muster station (LB-1, LB-2…) on the roster and on each on-board
-- record, from the room-allocation sheet.
-- =============================================================================

alter table public.offshore_staff add column if not exists lifeboat text;
alter table public.offshore_trips add column if not exists lifeboat text;
