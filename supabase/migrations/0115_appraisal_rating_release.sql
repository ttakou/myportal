-- Rating release to staff: an employee only sees their final rating once HR
-- explicitly releases it. Until then they see comments/remarks only — never a
-- provisional or intermediate rating. This stamp records the release moment.
alter table public.appraisals
  add column if not exists rating_released_at timestamptz;

comment on column public.appraisals.rating_released_at is
  'When HR released the final (PGM-signed-off) rating to the employee. Null = the employee must not be shown any score yet.';
