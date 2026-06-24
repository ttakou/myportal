-- =============================================================================
-- Training & Competence Management module.
--
-- Course catalogue + providers/trainers, statutory training matrix (who must do
-- what), sessions and participant enrolments, completion/certificate records
-- (with expiry), individual training requests (with manager/HR approval),
-- personal & annual training plans, a competency framework with per-employee
-- levels, training budgets and post-training evaluations.
--
-- RLS: every table is tenant-scoped. Reference/admin data (catalogue, providers,
-- trainers, competencies, requirements, sessions, budgets) is tenant-readable and
-- written by tenant admins or holders of the `training:manage` permission.
-- Person-scoped data (participants, records, requests, plan items, employee
-- competencies, evaluations) is readable by its owner, and read/written by
-- admins / `training:manage` holders (manager & HR consoles).
-- =============================================================================

insert into public.services_catalog (slug, name, description, icon, route_path, is_core, sort_order)
values (
  'training',
  'Training & Competence',
  'Course catalogue, statutory compliance, certificates, competency matrix and training plans.',
  'GraduationCap',
  '/training',
  false,
  90
)
on conflict (slug) do nothing;

-- --- enums ------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'training_delivery') then
    create type public.training_delivery as enum ('classroom','online','on_job','external','webinar');
  end if;
  if not exists (select 1 from pg_type where typname = 'training_session_status') then
    create type public.training_session_status as enum ('planned','open','in_progress','completed','cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'training_participant_status') then
    create type public.training_participant_status as enum ('enrolled','attended','passed','failed','no_show','cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'training_request_status') then
    create type public.training_request_status as enum ('requested','manager_approved','approved','rejected','cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'training_plan_status') then
    create type public.training_plan_status as enum ('planned','scheduled','in_progress','completed','deferred','cancelled');
  end if;
end$$;

-- --- helper: standard updated_at trigger applied per table below -------------

-- =============================================================================
-- Reference / catalogue tables (tenant-readable, admin/manage-writable)
-- =============================================================================

create table if not exists public.training_providers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  name         text not null,
  contact_name text,
  email        text,
  phone        text,
  website      text,
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.training_trainers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,  -- internal trainer
  provider_id uuid references public.training_providers(id) on delete set null,
  full_name   text not null,
  email       text,
  expertise   text,
  is_internal boolean not null default true,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.training_competencies (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  code        text,
  name        text not null,
  category    text,
  description text,
  max_level   int not null default 5,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.training_courses (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  code            text,
  title           text not null,
  description     text,
  category        text,
  delivery        public.training_delivery not null default 'classroom',
  provider_id     uuid references public.training_providers(id) on delete set null,
  default_trainer_id uuid references public.training_trainers(id) on delete set null,
  is_statutory    boolean not null default false,   -- mandatory / regulatory
  validity_months int,                              -- null = no expiry
  duration_hours  numeric(6,2),
  cost            numeric(12,2),
  currency        text not null default 'USD',
  pass_score      numeric(5,2),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Competencies a course develops (and to what target level).
create table if not exists public.training_course_competencies (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  course_id     uuid not null references public.training_courses(id) on delete cascade,
  competency_id uuid not null references public.training_competencies(id) on delete cascade,
  target_level  int not null default 1,
  unique (course_id, competency_id)
);

-- Statutory training matrix: which course is required for whom, and how often.
create table if not exists public.training_requirements (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  course_id        uuid not null references public.training_courses(id) on delete cascade,
  applies_to       text not null default 'all',     -- 'all' | 'department' | 'job_title' | 'employee_type'
  applies_value    text,                             -- the department / title / type (null for 'all')
  recurrence_months int,                             -- refresher cadence (null = once / use course validity)
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- =============================================================================
-- Sessions & enrolments
-- =============================================================================

create table if not exists public.training_sessions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  course_id   uuid not null references public.training_courses(id) on delete cascade,
  provider_id uuid references public.training_providers(id) on delete set null,
  trainer_id  uuid references public.training_trainers(id) on delete set null,
  title       text,
  location    text,
  delivery    public.training_delivery,
  starts_at   timestamptz,
  ends_at     timestamptz,
  capacity    int,
  cost        numeric(12,2),
  currency    text not null default 'USD',
  status      public.training_session_status not null default 'planned',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.training_participants (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  session_id     uuid not null references public.training_sessions(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  status         public.training_participant_status not null default 'enrolled',
  score          numeric(5,2),
  attended       boolean not null default false,
  completed_at   timestamptz,
  certificate_no text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (session_id, profile_id)
);

-- Canonical completion / certificate record (drives certs, compliance, expiry).
create table if not exists public.training_records (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  course_id       uuid not null references public.training_courses(id) on delete cascade,
  session_id      uuid references public.training_sessions(id) on delete set null,
  completed_on    date not null default current_date,
  expires_on      date,                              -- null = never expires
  score           numeric(5,2),
  certificate_no  text,
  certificate_url text,
  source          text not null default 'manual',    -- 'session' | 'manual' | 'external'
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =============================================================================
-- Requests & plans
-- =============================================================================

create table if not exists public.training_requests (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  course_id        uuid references public.training_courses(id) on delete set null,
  course_title     text,                             -- free-text when not in catalogue
  reason           text,
  preferred_period text,
  estimated_cost   numeric(12,2),
  status           public.training_request_status not null default 'requested',
  manager_id       uuid references public.profiles(id) on delete set null,
  decided_by       uuid references public.profiles(id) on delete set null,
  decided_at       timestamptz,
  decision_note    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.training_plan_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  course_id    uuid references public.training_courses(id) on delete set null,
  course_title text,
  plan_year    int not null,
  period       text,                                 -- e.g. 'Q1', 'Jan', a target month
  status       public.training_plan_status not null default 'planned',
  source       text not null default 'manager',      -- 'mandatory' | 'request' | 'manager' | 'development'
  session_id   uuid references public.training_sessions(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- =============================================================================
-- Competency levels, budgets, evaluations
-- =============================================================================

create table if not exists public.training_employee_competencies (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  competency_id uuid not null references public.training_competencies(id) on delete cascade,
  current_level int not null default 0,
  assessed_on   date,
  expires_on    date,
  assessed_by   uuid references public.profiles(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (profile_id, competency_id)
);

create table if not exists public.training_budgets (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  budget_year int not null,
  department text,                                    -- null = whole organisation
  amount     numeric(14,2) not null default 0,
  currency   text not null default 'USD',
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, budget_year, department)
);

create table if not exists public.training_evaluations (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  session_id     uuid references public.training_sessions(id) on delete cascade,
  participant_id uuid references public.training_participants(id) on delete cascade,
  profile_id     uuid references public.profiles(id) on delete set null,
  kind           text not null default 'reaction',   -- Kirkpatrick: reaction|learning|behaviour|results
  score          numeric(5,2),
  comments       text,
  evaluated_on   date not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- --- indexes ----------------------------------------------------------------
create index if not exists idx_training_courses_tenant on public.training_courses(tenant_id);
create index if not exists idx_training_sessions_course on public.training_sessions(course_id);
create index if not exists idx_training_participants_session on public.training_participants(session_id);
create index if not exists idx_training_participants_profile on public.training_participants(profile_id);
create index if not exists idx_training_records_profile on public.training_records(profile_id);
create index if not exists idx_training_records_course on public.training_records(course_id);
create index if not exists idx_training_records_expires on public.training_records(expires_on);
create index if not exists idx_training_requests_profile on public.training_requests(profile_id);
create index if not exists idx_training_plan_items_profile on public.training_plan_items(profile_id);
create index if not exists idx_training_emp_comp_profile on public.training_employee_competencies(profile_id);
create index if not exists idx_training_requirements_course on public.training_requirements(course_id);

-- --- updated_at triggers -----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'training_providers','training_trainers','training_competencies','training_courses',
    'training_requirements','training_sessions','training_participants','training_records',
    'training_requests','training_plan_items','training_employee_competencies',
    'training_budgets','training_evaluations'
  ] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end$$;

-- =============================================================================
-- RLS
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'training_providers','training_trainers','training_competencies','training_courses',
    'training_course_competencies','training_requirements','training_sessions',
    'training_participants','training_records','training_requests','training_plan_items',
    'training_employee_competencies','training_budgets','training_evaluations'
  ] loop
    execute format('alter table public.%1$s enable row level security', t);
  end loop;
end$$;

-- Reference/admin tables: tenant read, admin / training:manage write.
do $$
declare t text;
begin
  foreach t in array array[
    'training_providers','training_trainers','training_competencies','training_courses',
    'training_course_competencies','training_requirements','training_sessions',
    'training_budgets'
  ] loop
    execute format($p$drop policy if exists "%1$s_select" on public.%1$s$p$, t);
    execute format($p$create policy "%1$s_select" on public.%1$s for select to authenticated
      using (tenant_id = public.current_tenant_id() or public.is_super_admin())$p$, t);
    execute format($p$drop policy if exists "%1$s_write" on public.%1$s$p$, t);
    execute format($p$create policy "%1$s_write" on public.%1$s for all to authenticated
      using (public.is_super_admin() or (tenant_id = public.current_tenant_id()
             and (public.is_tenant_admin() or public.has_module_permission('training','manage'))))
      with check (public.is_super_admin() or (tenant_id = public.current_tenant_id()
             and (public.is_tenant_admin() or public.has_module_permission('training','manage'))))$p$, t);
  end loop;
end$$;

-- Person-scoped tables: owner reads own; admins / training:manage read & write all.
do $$
declare t text;
begin
  foreach t in array array[
    'training_participants','training_records','training_requests','training_plan_items',
    'training_employee_competencies','training_evaluations'
  ] loop
    execute format($p$drop policy if exists "%1$s_select_own" on public.%1$s$p$, t);
    execute format($p$create policy "%1$s_select_own" on public.%1$s for select to authenticated
      using (profile_id = auth.uid())$p$, t);
    execute format($p$drop policy if exists "%1$s_admin_all" on public.%1$s$p$, t);
    execute format($p$create policy "%1$s_admin_all" on public.%1$s for all to authenticated
      using (public.is_super_admin() or (tenant_id = public.current_tenant_id()
             and (public.is_tenant_admin() or public.has_module_permission('training','manage'))))
      with check (public.is_super_admin() or (tenant_id = public.current_tenant_id()
             and (public.is_tenant_admin() or public.has_module_permission('training','manage'))))$p$, t);
  end loop;
end$$;

-- Employees may raise their own training requests.
drop policy if exists "training_requests_insert_self" on public.training_requests;
create policy "training_requests_insert_self" on public.training_requests for insert to authenticated
  with check (profile_id = auth.uid() and tenant_id = public.current_tenant_id());
