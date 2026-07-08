-- Continuous performance management: lightweight activities between formal
-- appraisal stages, plus the HR configuration that governs them.

-- ── HR configuration (one row per tenant) ──────────────────────────────────
create table if not exists public.continuous_config (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null unique references public.tenants(id) on delete cascade,
  check_in_frequency          text not null default 'monthly',
  -- ordered questions: [{ "id": "...", "label": "...", "required": true }]
  check_in_template           jsonb not null default '[]'::jsonb,
  -- employee pulse questions: [{ "id": "...", "label": "...", "scale": 5 }]
  pulse_questions             jsonb not null default '[]'::jsonb,
  -- who may initiate feedback requests: any of employee / manager / peer
  feedback_initiators         jsonb not null default '["employee","manager","peer"]'::jsonb,
  feedback_anonymous          boolean not null default false,
  feedback_in_appraisal       boolean not null default true,
  allow_private_manager_notes boolean not null default true,
  -- which features are switched on (key → bool)
  enabled_features            jsonb not null default '{
    "one_to_one":true,"check_in":true,"goal_update":true,"feedback":true,
    "recognition":true,"coaching_note":true,"achievement":true,
    "development_action":true,"journal":true,"manager_note":true,"pulse":true
  }'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint continuous_config_freq_chk check (
    check_in_frequency in ('weekly','biweekly','monthly','quarterly','none')
  )
);

alter table public.continuous_config enable row level security;

drop policy if exists "continuous_config_select" on public.continuous_config;
create policy "continuous_config_select" on public.continuous_config for select to authenticated
  using ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())));

drop policy if exists "continuous_config_manage" on public.continuous_config;
create policy "continuous_config_manage" on public.continuous_config for all to authenticated
  using ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())
          and ((select public.is_hr()) or (select public.is_tenant_admin()))))
  with check ((select public.is_super_admin()) or (tenant_id = (select public.current_tenant_id())
          and ((select public.is_hr()) or (select public.is_tenant_admin()))));

insert into public.continuous_config (tenant_id)
  select id from public.tenants t
  where not exists (select 1 from public.continuous_config c where c.tenant_id = t.id);

-- ── Activities (one discriminated table for the lightweight feature set) ────
create table if not exists public.continuous_activities (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  kind            text not null,
  -- the employee the activity is about
  subject_id      uuid not null references public.profiles(id) on delete cascade,
  -- who created it
  author_id       uuid not null references public.profiles(id) on delete cascade,
  -- the other party (manager in a 1:1, recogniser/recognisee, feedback giver…)
  counterpart_id  uuid references public.profiles(id) on delete set null,
  title           text,
  body            text,
  -- structured per-kind payload (check-in answers, pulse value, badge, …)
  data            jsonb not null default '{}'::jsonb,
  is_private      boolean not null default false,
  is_anonymous    boolean not null default false,
  -- surface this item inside the appraisal?
  in_appraisal    boolean not null default false,
  appraisal_id    uuid references public.appraisals(id) on delete set null,
  status          text,
  due_date        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint continuous_activities_kind_chk check (kind in (
    'one_to_one','check_in','goal_update','feedback_request','feedback_response',
    'recognition','coaching_note','achievement','development_action','journal',
    'manager_note','pulse_response'
  ))
);

create index if not exists continuous_activities_tenant_idx on public.continuous_activities (tenant_id);
create index if not exists continuous_activities_subject_idx on public.continuous_activities (subject_id, kind);
create index if not exists continuous_activities_author_idx on public.continuous_activities (author_id);

alter table public.continuous_activities enable row level security;

-- Visibility: you see what you authored; the subject sees non-private items
-- about them; the named counterpart sees theirs; HR/admin see everything except
-- other people's private notes.
drop policy if exists "continuous_activities_select" on public.continuous_activities;
create policy "continuous_activities_select" on public.continuous_activities for select to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id()) and (
      author_id = (select auth.uid())
      or (subject_id = (select auth.uid()) and not is_private)
      or counterpart_id = (select auth.uid())
      or (((select public.is_hr()) or (select public.is_tenant_admin())) and not is_private)
    ))
  );

drop policy if exists "continuous_activities_insert" on public.continuous_activities;
create policy "continuous_activities_insert" on public.continuous_activities for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id()) and author_id = (select auth.uid())
  );

drop policy if exists "continuous_activities_modify" on public.continuous_activities;
create policy "continuous_activities_modify" on public.continuous_activities for update to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and (author_id = (select auth.uid()) or (select public.is_hr()) or (select public.is_tenant_admin())))
  )
  with check (tenant_id = (select public.current_tenant_id()));

drop policy if exists "continuous_activities_delete" on public.continuous_activities;
create policy "continuous_activities_delete" on public.continuous_activities for delete to authenticated
  using (
    (select public.is_super_admin())
    or (tenant_id = (select public.current_tenant_id())
        and (author_id = (select auth.uid()) or (select public.is_hr()) or (select public.is_tenant_admin())))
  );
