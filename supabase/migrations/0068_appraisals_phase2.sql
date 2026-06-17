-- 0068: Appraisals Phase 2 — mid-year progress, self-assessment & manager
-- evaluation with ratings. Adds rating/comment columns; the weighted overall
-- rating is computed by the server action on manager submission.

alter table public.appraisal_goals
  add column if not exists employee_self_rating numeric,
  add column if not exists employee_comment      text,
  add column if not exists manager_rating        numeric,
  add column if not exists manager_comment        text,
  add column if not exists at_risk                boolean not null default false;

alter table public.appraisals
  add column if not exists employee_summary text,
  add column if not exists manager_summary  text;
