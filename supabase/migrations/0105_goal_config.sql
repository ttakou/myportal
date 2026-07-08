-- Configurable goal management (Performance reshape, §4).
-- Extends the tenant goal rules and adds a reusable goal library (corporate /
-- department / team templates employees can pick from), each capturing a
-- measurement type.

alter table public.performance_config
  add column if not exists min_goal_weight smallint not null default 0,
  add column if not exists max_goal_weight smallint not null default 100,
  add column if not exists allow_modify_approved boolean not null default false,
  add column if not exists changes_require_approval boolean not null default true,
  add column if not exists allow_carry_forward boolean not null default true,
  add column if not exists allow_cascade boolean not null default true;

create table if not exists public.goal_templates (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  title                text not null,
  description          text,
  category             text,
  level                text not null default 'individual',
  default_weight       smallint not null default 0,
  measurement_type     text not null default 'percentage',
  unit                 text,
  strategic_objective  text,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint goal_templates_level_chk check (level in ('corporate','department','team','individual')),
  constraint goal_templates_measure_chk check (
    measurement_type in ('percentage','number','currency','date','yes_no','milestone','qualitative','formula')
  )
);

create index if not exists goal_templates_tenant_idx on public.goal_templates (tenant_id);

alter table public.goal_templates enable row level security;

drop policy if exists "goal_templates_select" on public.goal_templates;
create policy "goal_templates_select" on public.goal_templates for select to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()))
  );

drop policy if exists "goal_templates_manage" on public.goal_templates;
create policy "goal_templates_manage" on public.goal_templates for all to authenticated
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
