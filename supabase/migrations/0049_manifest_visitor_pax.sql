-- Allow a manifest passenger to be a visitor (linked to a visit request)
-- instead of a roster profile.
alter table public.offshore_manifest_pax
  add column if not exists visit_request_id uuid
  references public.offshore_visit_requests(id) on delete set null;
