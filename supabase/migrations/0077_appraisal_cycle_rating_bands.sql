-- 0077: Configurable score → rating bands per appraisal cycle.
-- Bands are an ordered JSON array of { min, label }; the highest min a score
-- meets wins. Defaults to the spec's five-band scale.

alter table public.appraisal_cycles
  add column if not exists rating_bands jsonb not null default
  '[{"min":90,"label":"Exceptional"},
    {"min":80,"label":"Exceeds Expectations"},
    {"min":70,"label":"Meets Expectations"},
    {"min":60,"label":"Partially Meets Expectations"},
    {"min":0,"label":"Does Not Meet Expectations"}]'::jsonb;
