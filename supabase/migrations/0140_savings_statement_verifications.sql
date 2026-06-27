-- Verifiable savings statements: each generated statement snapshots its key
-- figures under a short public code, so a printed/PDF copy can be checked as
-- genuine at /verify/statement?code=... (looked up via the service role).
create table if not exists public.savings_statement_verifications (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tenant_name text,
  holder_name text,
  from_date date not null,
  to_date date not null,
  opening numeric(14,2) not null,
  closing numeric(14,2) not null,
  generated_at timestamptz not null default now(),
  unique (profile_id, from_date, to_date, opening, closing)
);

create index if not exists ssv_code_idx on public.savings_statement_verifications (code);

alter table public.savings_statement_verifications enable row level security;
-- Owner/admin may read their rows directly; the public verify page reads by
-- code through the service role, so no public RLS policy is needed.
drop policy if exists "ssv_owner_admin_read" on public.savings_statement_verifications;
create policy "ssv_owner_admin_read" on public.savings_statement_verifications for select to authenticated
  using (
    profile_id = auth.uid()
    or (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
    or public.is_super_admin()
  );
