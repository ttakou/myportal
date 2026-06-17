-- 0084: Scope department objectives to a cycle (null = evergreen / all cycles).

alter table public.appraisal_department_objectives
  add column if not exists cycle_id uuid references public.appraisal_cycles(id) on delete cascade;
create index if not exists appraisal_department_objectives_cycle_idx
  on public.appraisal_department_objectives(cycle_id);
