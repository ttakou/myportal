-- How far along a goal is, as a figure.
--
-- Mid-year captured a free-text note and an at-risk flag, and nothing countable.
-- The only percentage on the screen belonged to a key result, so a goal without
-- key results — most of them — had no way to say it was 40% done, and no report
-- could add progress up across a team.
--
-- Separate from key-result progress on purpose: a key result measures one
-- result, this measures the goal. Deriving one from the other would overwrite
-- whatever somebody typed the moment they edited the other.

alter table public.appraisal_goals
  add column if not exists progress_percent smallint
    check (progress_percent is null or (progress_percent >= 0 and progress_percent <= 100));

comment on column public.appraisal_goals.progress_percent is
  'How far along the goal is, 0-100, entered by the employee at a review point. Null until they say. Independent of key-result progress, which measures each result separately.';
