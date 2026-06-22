-- Calibration 9-box: a potential rating (1 low … 3 high) per appraisal, to plot
-- against performance.
alter table public.appraisals add column if not exists potential_rating smallint;
alter table public.appraisals drop constraint if exists appraisals_potential_chk;
alter table public.appraisals add constraint appraisals_potential_chk
  check (potential_rating is null or potential_rating between 1 and 3);
