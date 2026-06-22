-- Configurable calibration: tenant-level defaults + per-cycle calibration groups.

create table if not exists public.calibration_settings (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null unique references public.tenants(id) on delete cascade,
  -- forced distribution vs guidance only
  mode                text not null default 'guidance',
  -- target distribution: [{ "label": "Exceeds", "percent": 20 }, …]
  distribution        jsonb not null default '[]'::jsonb,
  -- how many rating levels a score may be moved during calibration
  adjustment_limit    smallint not null default 1,
  require_justification boolean not null default true,
  approval_role       text not null default 'hr',
  default_group_by    text not null default 'department',
  -- confidentiality rules
  confidentiality     jsonb not null default
    '{"showPreliminaryToManagers":true,"showAdjustmentReasons":true,"anonymizeInCharts":false}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint calibration_settings_mode_chk check (mode in ('forced','guidance')),
  constraint calibration_settings_group_chk check (
    default_group_by in ('department','grade','job_family','business_unit','management_level')
  )
);

create table if not exists public.calibration_groups (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  cycle_id            uuid references public.appraisal_cycles(id) on delete cascade,
  name                text not null,
  group_by            text not null default 'department',
  group_value         text,
  status              text not null default 'open',
  -- optional per-group overrides of the tenant defaults
  mode                text,
  distribution        jsonb,
  adjustment_limit    smallint,
  require_justification boolean,
  approval_role       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint calibration_groups_groupby_chk check (
    group_by in ('department','grade','job_family','business_unit','management_level')
  ),
  constraint calibration_groups_status_chk check (status in ('open','locked','approved')),
  constraint calibration_groups_mode_chk check (mode is null or mode in ('forced','guidance'))
);

create index if not exists calibration_groups_tenant_idx on public.calibration_groups (tenant_id, cycle_id);

alter table public.calibration_settings enable row level security;
alter table public.calibration_groups enable row level security;

-- Calibration is HR-sensitive: HR / admins (and super admins) only.
drop policy if exists "calibration_settings_rw" on public.calibration_settings;
create policy "calibration_settings_rw" on public.calibration_settings for all to authenticated
  using ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())
          and ((select public.is_hr()) or (select public.is_tenant_admin()))))
  with check ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())
          and ((select public.is_hr()) or (select public.is_tenant_admin()))));

drop policy if exists "calibration_groups_rw" on public.calibration_groups;
create policy "calibration_groups_rw" on public.calibration_groups for all to authenticated
  using ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())
          and ((select public.is_hr()) or (select public.is_tenant_admin()))))
  with check ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())
          and ((select public.is_hr()) or (select public.is_tenant_admin()))));

insert into public.calibration_settings (tenant_id, distribution)
  select id, '[{"label":"Exceeds","percent":20},{"label":"Meets","percent":70},{"label":"Below","percent":10}]'::jsonb
  from public.tenants t
  where not exists (select 1 from public.calibration_settings c where c.tenant_id = t.id);
