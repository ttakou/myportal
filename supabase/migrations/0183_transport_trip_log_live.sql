-- Transportation: the driver's side of a trip, live alerts, and the
-- requester's word afterwards.
--
-- 1) Two more states — arrived at pickup, passenger no-show — and the
--    moments a trip passes through (started, arrived, completed) so the
--    desk sees where a driver is and the SLA report has real times.
-- 2) A trip log the driver fills on completion: odometer at start and end,
--    fuel taken and its cost. The cost report is built from it.
-- 3) Stamps for the live job: when the driver was reminded, when the desk
--    was told a task had not started.
-- 4) A rating (1–5) and comment from the requester after the ride.

-- Applied separately first (a new enum value cannot be used in the same
-- transaction that adds it):
--   alter type public.transport_request_status add value if not exists 'arrived';
--   alter type public.transport_request_status add value if not exists 'no_show';

alter table public.transport_requests
  add column if not exists started_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists odometer_start integer check (odometer_start >= 0),
  add column if not exists odometer_end integer check (odometer_end >= 0),
  add column if not exists fuel_litres numeric(8,2) check (fuel_litres >= 0),
  add column if not exists fuel_cost numeric(12,2) check (fuel_cost >= 0),
  add column if not exists reminded_at timestamptz,
  add column if not exists late_alerted_at timestamptz,
  add column if not exists rating smallint check (rating between 1 and 5),
  add column if not exists rating_comment text,
  add column if not exists rated_at timestamptz;

-- The live job asks "what departs soon / departed and has not started".
create index if not exists idx_transport_requests_status_depart
  on public.transport_requests (status, depart_at);
