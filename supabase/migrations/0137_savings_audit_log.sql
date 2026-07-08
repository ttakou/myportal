-- Audit trail for the savings module. Every mutating action (accounts,
-- transactions, imports, interest, withdrawals, config) is recorded here.
create table if not exists public.savings_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,          -- e.g. 'transaction.post', 'import.commit'
  entity text not null,          -- account | transaction | import_batch | withdrawal | config | interest
  entity_id uuid,
  summary text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists savings_audit_tenant_time_idx
  on public.savings_audit_log (tenant_id, created_at desc);

alter table public.savings_audit_log enable row level security;

-- Admins read the trail; writes go through the service role in server actions.
drop policy if exists "savings_audit_select" on public.savings_audit_log;
create policy "savings_audit_select" on public.savings_audit_log for select to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));
