-- Why someone is going offshore: asked on the trip request form and shown to
-- the OIM who clears it. Trips opened by the crew-change schedule have none.
alter table public.offshore_trips add column if not exists purpose text;
