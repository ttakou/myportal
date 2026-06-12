-- =============================================================================
-- Live flight tracking
-- Extra flight_status values reported by flight-data APIs, plus a marker for
-- when the flight info was last refreshed from the API.
-- =============================================================================

alter type public.flight_status add value if not exists 'cancelled';
alter type public.flight_status add value if not exists 'diverted';

alter table public.out_of_town_trips
  add column if not exists flight_checked_at timestamptz;
