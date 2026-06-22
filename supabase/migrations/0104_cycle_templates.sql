-- Configurable cycle types & templates (Performance reshape, §1).
-- A template is a reusable recipe HR defines once (type, rating scale, weights,
-- approvals, reminders, eligible population, visibility); launching a cycle
-- copies the template's defaults into an appraisal_cycles row.

create table if not exists public.cycle_templates (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  name                  text not null,
  description           text,
  cycle_type            text not null default 'annual',
  rating_scale_id       uuid references public.rating_scales(id) on delete set null,
  weight_okr            smallint not null default 60,
  weight_competency     smallint not null default 30,
  weight_development    smallint not null default 10,
  require_second_level  boolean not null default false,
  reminder_days_before  smallint not null default 7,
  -- { "type": "all" } | { "type": "department", "departments": [..] } | { "type":"grade","grades":[..] }
  population            jsonb not null default '{"type":"all"}'::jsonb,
  -- visibility rules (employee sees manager rating / score; blind review …)
  visibility            jsonb not null default
    '{"employeeSeesManagerRating":true,"employeeSeesScore":true,"managerSeesSelfBeforeRating":true}'::jsonb,
  rating_bands          jsonb,
  -- reserved for later phases (workflow stages, score formula)
  config                jsonb not null default '{}'::jsonb,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint cycle_templates_type_chk check (
    cycle_type in ('annual','probation','midyear','project','promotion','leadership','pip')
  ),
  constraint cycle_templates_weights_chk check (
    weight_okr between 0 and 100 and weight_competency between 0 and 100 and weight_development between 0 and 100
  )
);

create index if not exists cycle_templates_tenant_idx on public.cycle_templates (tenant_id);

-- Cycles record their type and which scale/template they were launched from.
alter table public.appraisal_cycles add column if not exists cycle_type text not null default 'annual';
alter table public.appraisal_cycles add column if not exists rating_scale_id uuid references public.rating_scales(id) on delete set null;
alter table public.appraisal_cycles add column if not exists template_id uuid references public.cycle_templates(id) on delete set null;

alter table public.cycle_templates enable row level security;

drop policy if exists "cycle_templates_select" on public.cycle_templates;
create policy "cycle_templates_select" on public.cycle_templates for select to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()))
  );

drop policy if exists "cycle_templates_manage" on public.cycle_templates;
create policy "cycle_templates_manage" on public.cycle_templates for all to authenticated
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

-- Seed an "Annual appraisal" template per tenant, pointing at its default scale.
insert into public.cycle_templates (tenant_id, name, cycle_type, rating_scale_id, weight_okr, weight_competency, weight_development)
  select t.id, 'Annual appraisal', 'annual',
         (select rs.id from public.rating_scales rs
            where rs.tenant_id = t.id and rs.kind = 'performance' and rs.is_default limit 1),
         60, 30, 10
  from public.tenants t
  where not exists (select 1 from public.cycle_templates ct where ct.tenant_id = t.id);
