-- Individual training requests capture their origin — why the training is being
-- sought. A constrained taxonomy so it can drive reporting (training by origin).
alter table public.training_requests
  add column if not exists origin text;

alter table public.training_requests
  drop constraint if exists training_requests_origin_chk;
alter table public.training_requests
  add constraint training_requests_origin_chk check (
    origin is null or origin in (
      'employee_request',
      'manager_request',
      'performance_appraisal',
      'competency_gap',
      'career_development',
      'promotion_preparation',
      'succession_plan',
      'technology_change',
      'job_change',
      'personal_development_plan',
      'project_requirement'
    )
  );
