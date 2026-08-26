-- =============================================================================
-- Which phase a cycle is open on.
--
-- The phase was derived from the calendar alone: cycle start plus each stage's
-- offset, first phase whose date has not passed. That is a guess, and it is
-- wrong whenever the process runs behind its dates — which is exactly the case
-- here, where the dates say Final Review and not one of the 127 appraisals has
-- moved past goal setting.
--
-- Where the cycle actually is, is a decision somebody makes. This records it.
-- Null keeps the old behaviour, so a cycle nobody has set still reads from the
-- calendar rather than showing nothing.
-- =============================================================================

alter table public.appraisal_cycles
  add column if not exists current_phase text;

comment on column public.appraisal_cycles.current_phase is
  'The phase the cycle is open on, by name (e.g. "Mid Year Review"). Null = derive from the stage dates.';
