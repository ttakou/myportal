-- Crew-change days on the meal sheet: whether the person arrives (MOB),
-- leaves (DEMOB) or comes and goes the same day ("day"). Null = staying.
-- The sheet groups and marks them, and starts their ticks accordingly.
alter table public.offshore_meal_entries
  add column if not exists movement text
  check (movement in ('arrival', 'departure', 'day'));
