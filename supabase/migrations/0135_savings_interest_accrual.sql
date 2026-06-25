-- Treat withdrawals as the only debit; contributions and interest are credits.
create or replace function public.savings_apply_txn()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.savings_accounts
     set balance = balance + (case when new.kind = 'withdrawal' then -new.amount else new.amount end)
   where id = new.account_id;
  return new;
end $$;

-- Idempotency is now per kind+period so a month can carry both an imported
-- contribution and an interest accrual (previously only one period-tagged
-- transaction per account was allowed).
drop index if exists public.savings_txn_account_period_uniq;
create unique index if not exists savings_txn_account_kind_period_uniq
  on public.savings_transactions (account_id, kind, period)
  where period is not null;
