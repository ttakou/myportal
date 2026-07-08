-- =============================================================================
-- Offshore crew change: automatic vs manual mode, recorded per trip
-- =============================================================================
-- A crew change can be run two ways:
--   * 'auto'   — derived from the rotation schedule (dates, members and fixed
--                cabins all computed from the crew's cycle), one click.
--   * 'manual' — the operator chooses who boards, the mob/demob dates and the
--                cabins for this specific crew change (pre-filled from the
--                schedule, then edited).
-- The mode is stamped on each boarding so the board can show how it was made.
-- Existing rows default to 'auto', so nothing changes for current data.
-- =============================================================================

alter table public.offshore_trips
  add column if not exists mode text not null default 'auto'
    check (mode in ('auto', 'manual'));

comment on column public.offshore_trips.mode is
  'How this boarding was created: ''auto'' = derived from the rotation schedule; '
  '''manual'' = operator chose people/dates/cabins for this crew change.';
