-- Record who opened or closed a phase, and when.
--
-- Opening a phase moves the whole cycle for every participant, and until now it
-- left no trace: `current_phase` held the answer but nothing said who decided it
-- or on what day. Every per-person sign-off writes an appraisal_event; a change
-- that moves 120 people at once recorded less than one that moves one.
--
-- `current_phase` now carries three meanings:
--   null          — read the phase off the stage dates
--   '<phase name>'— that phase is explicitly open
--   '__none__'    — every phase is explicitly closed
-- The third is what let HR shut the last phase; before it, the only way out of
-- an open phase was to open a different one.

alter table public.appraisal_cycles
  add column if not exists phase_set_by uuid references public.profiles(id) on delete set null,
  add column if not exists phase_set_at timestamptz;

comment on column public.appraisal_cycles.current_phase is
  'Open phase by name; null reads it from the stage dates; ''__none__'' means every phase is closed.';
comment on column public.appraisal_cycles.phase_set_by is
  'Who last opened or closed a phase on this cycle.';
comment on column public.appraisal_cycles.phase_set_at is
  'When the open phase was last changed.';
