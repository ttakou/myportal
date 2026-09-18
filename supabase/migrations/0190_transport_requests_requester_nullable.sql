-- A shuttle run has no requester: the nightly job (and the desk's "create
-- today's runs") writes it with the service role, where auth.uid() is null,
-- and the NOT NULL on requester_id refused every run since the shuttles
-- shipped. The column keeps its default (the signed-in user) for ordinary
-- requests; the own-row policies compare it to auth.uid(), which is simply
-- false for a null.
alter table public.transport_requests alter column requester_id drop not null;
