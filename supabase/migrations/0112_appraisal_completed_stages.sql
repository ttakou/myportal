-- Workflow parallel groups: track the set of completed stages per appraisal so
-- concurrent (parallel-group) stages can be in flight at once. current_stage_key
-- remains as a terminal flag (COMPLETED / REJECTED sentinels).
alter table public.appraisals add column if not exists completed_stages jsonb not null default '[]'::jsonb;
