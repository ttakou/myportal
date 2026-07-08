-- Configurable reporting: HR-built reports from selectable dimensions & measures.

create table if not exists public.report_definitions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  description   text,
  dimensions    jsonb not null default '[]'::jsonb,   -- ordered dimension keys
  measures      jsonb not null default '[]'::jsonb,   -- ordered measure keys
  filters       jsonb not null default '[]'::jsonb,   -- [{ dimension, op, value }]
  chart_type    text not null default 'table',        -- table | bar | line | pie
  schedule      jsonb,                                 -- { frequency, recipients[] } | null
  is_widget     boolean not null default false,        -- pin to dashboard
  -- role-based data access: which roles may view this report
  role_access   jsonb not null default '["hr"]'::jsonb,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint report_definitions_chart_chk check (chart_type in ('table','bar','line','pie'))
);

create index if not exists report_definitions_tenant_idx on public.report_definitions (tenant_id);

alter table public.report_definitions enable row level security;

-- Workforce analytics are HR-sensitive: HR / admins manage and read.
drop policy if exists "report_definitions_rw" on public.report_definitions;
create policy "report_definitions_rw" on public.report_definitions for all to authenticated
  using ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())
          and ((select public.is_hr()) or (select public.is_tenant_admin()))))
  with check ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())
          and ((select public.is_hr()) or (select public.is_tenant_admin()))));
