-- Configurable performance management — Phase 1: a tenant-level config template
-- HR can edit, plus a per-cycle override hook.
--
-- Today appraisal settings live ad hoc on appraisal_cycles. This introduces a
-- single house-standard config per tenant (max goals, who may comment, default
-- weights/bands, reviewer count, etc.). Each cycle inherits it and may override
-- selected keys via appraisal_cycles.config (jsonb), resolved app-side.

create table if not exists public.performance_config (
  id                            uuid primary key default gen_random_uuid(),
  tenant_id                     uuid not null unique references public.tenants(id) on delete cascade,

  -- Goal rules
  min_goals                     smallint not null default 1,
  max_goals                     smallint not null default 8,
  goal_weights_total_100        boolean  not null default true,
  require_success_indicator     boolean  not null default false,
  require_alignment             boolean  not null default false,

  -- Who may comment (per role), toggled by HR
  allow_employee_comments       boolean  not null default true,
  allow_line_manager_comments   boolean  not null default true,
  allow_second_manager_comments boolean  not null default false,

  -- Reviewers
  reviewer_count                smallint not null default 1,   -- 1 or 2 managers
  blind_review                  boolean  not null default false,

  -- Scoring defaults (a launched cycle copies these unless overridden)
  weight_okr                    smallint not null default 60,
  weight_competency             smallint not null default 30,
  weight_development            smallint not null default 10,
  rating_bands                  jsonb    not null default
    '[{"min":90,"label":"Exceptional"},
      {"min":80,"label":"Exceeds Expectations"},
      {"min":70,"label":"Meets Expectations"},
      {"min":60,"label":"Partially Meets Expectations"},
      {"min":0,"label":"Does Not Meet Expectations"}]'::jsonb,
  calibration_enabled           boolean  not null default true,

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  constraint performance_config_goals_chk check (min_goals >= 0 and max_goals >= min_goals),
  constraint performance_config_reviewers_chk check (reviewer_count in (1, 2)),
  constraint performance_config_weights_chk check (
    weight_okr between 0 and 100 and
    weight_competency between 0 and 100 and
    weight_development between 0 and 100
  )
);

-- Per-cycle override of selected config keys (null = inherit tenant template).
alter table public.appraisal_cycles add column if not exists config jsonb;

alter table public.performance_config enable row level security;

-- Tenant members read the config (the employee UI enforces max goals / comment
-- toggles); only HR (or tenant/super admins) may change it — mirrors appraisal_cycles.
drop policy if exists "perf_config_select" on public.performance_config;
create policy "perf_config_select" on public.performance_config for select to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()))
  );

drop policy if exists "perf_config_manage" on public.performance_config;
create policy "perf_config_manage" on public.performance_config for all to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_hr()) or (select public.is_tenant_admin())))
  )
  with check (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and ((select public.is_hr()) or (select public.is_tenant_admin())))
  );

-- Seed a default template for every existing tenant so config always resolves.
insert into public.performance_config (tenant_id)
  select id from public.tenants
  on conflict (tenant_id) do nothing;
