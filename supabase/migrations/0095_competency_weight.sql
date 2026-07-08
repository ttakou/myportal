-- Per-competency weighting: competencies were averaged equally in the score.
-- A relative weight (default 1) lets HR make some competencies count more; the
-- competency component becomes a weight-weighted average of the manager ratings.
alter table public.appraisal_competencies
  add column if not exists weight smallint not null default 1;
