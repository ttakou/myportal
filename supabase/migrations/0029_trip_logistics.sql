-- =============================================================================
-- Travel-desk logistics on the trip itself: the desk may update accommodation
-- (column already exists) and assign a driver + car for ground transport,
-- independent of any airport meet & greet.
-- =============================================================================

alter table public.out_of_town_trips
  add column if not exists assigned_driver_name  text,
  add column if not exists assigned_driver_phone text,
  add column if not exists assigned_vehicle      text;  -- type + plate
