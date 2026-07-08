-- Workflow runtime (part 2): track which configured stage a live appraisal is
-- on. Only used by cycles launched from a template that has config.stages; for
-- legacy appraisals this stays null and the existing flow is unchanged.
alter table public.appraisals add column if not exists current_stage_key text;
