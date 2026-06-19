-- =============================================================================
-- Visitors: capture the visitor's vehicle type and registration plate (optional).
--
-- The arrival time is already captured as visitors.check_in_at on check-in;
-- this adds the vehicle type + plate, recorded at pre-registration and/or
-- check-in and shown on the reception board and the emergency muster list.
-- =============================================================================

alter table public.visitors
  add column if not exists vehicle_type  text,
  add column if not exists vehicle_plate text;
