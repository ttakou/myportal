-- Group several visitors into a single visit request (one OIM approval).
alter table public.offshore_visit_requests add column if not exists group_id uuid;
