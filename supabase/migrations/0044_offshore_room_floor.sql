-- =============================================================================
-- Each offshore room sits on a floor / level / location within its block.
-- =============================================================================

alter table public.offshore_rooms
  add column if not exists floor text;
