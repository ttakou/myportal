-- Module: Employees Saving Management — cooperative ledger + loans
do $$
begin
  if not exists (select 1 from pg_type where typname='savings_txn_kind') then
    create type public.savings_txn_kind as enum ('contribution','withdrawal');
  end if;
  if not exists (select 1 from pg_type where typname='loan_status') then
    create type public.loan_status as enum ('active','closed');
  end if;
end$$;

create table if not exists public.savings_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  balance numeric(14,2) not null default 0, created_at timestamptz not null default now(),
  constraint savings_accounts_unique unique (tenant_id, profile_id)
);
create table if not exists public.savings_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null references public.savings_accounts(id) on delete cascade,
  kind public.savings_txn_kind not null, amount numeric(14,2) not null check (amount > 0), note text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_savings_txn_account on public.savings_transactions(account_id, created_at desc);
create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null references public.savings_accounts(id) on delete cascade,
  principal numeric(14,2) not null check (principal > 0), annual_rate numeric(6,4) not null default 0,
  term_months integer not null check (term_months > 0), monthly_payment numeric(14,2) not null default 0,
  outstanding numeric(14,2) not null default 0, status public.loan_status not null default 'active',
  start_date date not null default current_date, created_at timestamptz not null default now()
);
create index if not exists idx_loans_account on public.loans(account_id);
create table if not exists public.loan_repayments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  loan_id uuid not null references public.loans(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0), paid_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_loan_repayments_loan on public.loan_repayments(loan_id);

create or replace function public.savings_apply_txn()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.savings_accounts
     set balance = balance + (case when new.kind='contribution' then new.amount else -new.amount end)
   where id = new.account_id;
  return new;
end; $$;
drop trigger if exists trg_savings_apply_txn on public.savings_transactions;
create trigger trg_savings_apply_txn after insert on public.savings_transactions
  for each row execute function public.savings_apply_txn();

create or replace function public.loan_apply_repayment()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.loans
     set outstanding = greatest(0, outstanding - new.amount),
         status = case when outstanding - new.amount <= 0 then 'closed'::public.loan_status else status end
   where id = new.loan_id;
  return new;
end; $$;
drop trigger if exists trg_loan_apply_repayment on public.loan_repayments;
create trigger trg_loan_apply_repayment after insert on public.loan_repayments
  for each row execute function public.loan_apply_repayment();

alter table public.savings_accounts     enable row level security;
alter table public.savings_transactions enable row level security;
alter table public.loans                enable row level security;
alter table public.loan_repayments      enable row level security;

drop policy if exists "savings_acct_select" on public.savings_accounts;
create policy "savings_acct_select" on public.savings_accounts for select to authenticated
  using (profile_id = auth.uid() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));
drop policy if exists "savings_acct_admin" on public.savings_accounts;
create policy "savings_acct_admin" on public.savings_accounts for all to authenticated
  using (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));
drop policy if exists "savings_txn_select" on public.savings_transactions;
create policy "savings_txn_select" on public.savings_transactions for select to authenticated
  using (exists (select 1 from public.savings_accounts a where a.id=account_id and (a.profile_id=auth.uid() or (a.tenant_id=public.current_tenant_id() and public.is_tenant_admin()))));
drop policy if exists "savings_txn_admin" on public.savings_transactions;
create policy "savings_txn_admin" on public.savings_transactions for all to authenticated
  using (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));
drop policy if exists "loans_select" on public.loans;
create policy "loans_select" on public.loans for select to authenticated
  using (exists (select 1 from public.savings_accounts a where a.id=account_id and (a.profile_id=auth.uid() or (a.tenant_id=public.current_tenant_id() and public.is_tenant_admin()))));
drop policy if exists "loans_admin" on public.loans;
create policy "loans_admin" on public.loans for all to authenticated
  using (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));
drop policy if exists "loan_repay_select" on public.loan_repayments;
create policy "loan_repay_select" on public.loan_repayments for select to authenticated
  using (exists (select 1 from public.loans l join public.savings_accounts a on a.id=l.account_id where l.id=loan_id and (a.profile_id=auth.uid() or (a.tenant_id=public.current_tenant_id() and public.is_tenant_admin()))));
drop policy if exists "loan_repay_admin" on public.loan_repayments;
create policy "loan_repay_admin" on public.loan_repayments for all to authenticated
  using (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()))
  with check (public.is_super_admin() or (tenant_id=public.current_tenant_id() and public.is_tenant_admin()));
