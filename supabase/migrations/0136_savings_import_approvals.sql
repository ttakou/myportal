-- Configurable multi-step approval for the monthly savings import.
-- The step definition (count + validators per step) lives in
-- tenants.settings.savings.importApproval; a submitted import becomes a batch
-- that walks those steps before it is committed to member accounts.

create table if not exists public.savings_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period date not null,
  rows jsonb not null,                 -- [{ empNum, amount }]
  steps jsonb not null default '[]',   -- snapshot: [{ name, validators:[profileId] }]
  status text not null default 'pending'
    check (status in ('pending','rejected','committed','cancelled')),
  current_step int not null default 0,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  committed_at timestamptz,
  commit_result jsonb
);

create index if not exists sib_tenant_status_idx
  on public.savings_import_batches (tenant_id, status, created_at desc);

create table if not exists public.savings_import_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  batch_id uuid not null references public.savings_import_batches(id) on delete cascade,
  step_index int not null,
  decision text not null check (decision in ('approve','reject')),
  note text,
  decided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sia_batch_idx
  on public.savings_import_approvals (batch_id, step_index);

alter table public.savings_import_batches enable row level security;
alter table public.savings_import_approvals enable row level security;

-- Admins (and the submitter) can read batches; all writes go through the
-- service role in server actions, gated by validator/admin checks in app code.
drop policy if exists "sib_select" on public.savings_import_batches;
create policy "sib_select" on public.savings_import_batches for select to authenticated
  using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id() and (public.is_tenant_admin() or created_by = auth.uid()))
  );
drop policy if exists "sib_admin" on public.savings_import_batches;
create policy "sib_admin" on public.savings_import_batches for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));

drop policy if exists "sia_select" on public.savings_import_approvals;
create policy "sia_select" on public.savings_import_approvals for select to authenticated
  using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
  );
drop policy if exists "sia_admin" on public.savings_import_approvals;
create policy "sia_admin" on public.savings_import_approvals for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));
