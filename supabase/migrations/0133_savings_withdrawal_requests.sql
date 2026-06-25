-- Member-initiated withdrawal requests with a finance approval workflow:
--   requested -> approved -> released   (or -> rejected)
-- On release a 'withdrawal' transaction is posted to the member's account
-- (the balance trigger deducts it) and the resulting txn is linked here.

do $$ begin
  create type public.savings_withdrawal_status as enum
    ('requested','approved','rejected','released');
exception when duplicate_object then null; end $$;

create table if not exists public.savings_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null references public.savings_accounts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  reason text,
  status public.savings_withdrawal_status not null default 'requested',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  released_by uuid references public.profiles(id) on delete set null,
  released_at timestamptz,
  transaction_id uuid references public.savings_transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists swr_tenant_status_idx
  on public.savings_withdrawal_requests (tenant_id, status);
create index if not exists swr_profile_idx
  on public.savings_withdrawal_requests (profile_id, created_at desc);

alter table public.savings_withdrawal_requests enable row level security;

-- Members read their own requests; tenant admins read all in the tenant.
drop policy if exists "swr_select" on public.savings_withdrawal_requests;
create policy "swr_select" on public.savings_withdrawal_requests for select to authenticated
  using (
    profile_id = auth.uid()
    or (tenant_id = public.current_tenant_id() and public.is_tenant_admin())
  );

-- Members raise a request against their own account only.
drop policy if exists "swr_insert_own" on public.savings_withdrawal_requests;
create policy "swr_insert_own" on public.savings_withdrawal_requests for insert to authenticated
  with check (
    profile_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.savings_accounts a
      where a.id = account_id and a.profile_id = auth.uid()
    )
  );

-- Approval/release is handled server-side by finance staff via the service role,
-- but tenant admins may also manage directly.
drop policy if exists "swr_admin" on public.savings_withdrawal_requests;
create policy "swr_admin" on public.savings_withdrawal_requests for all to authenticated
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.is_tenant_admin()));
