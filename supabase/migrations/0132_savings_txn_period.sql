-- Monthly savings imports: tag each imported contribution with the period
-- (first day of the month it belongs to). A partial unique index makes
-- re-uploading the same month idempotent — only one period-tagged transaction
-- per account per month. Manual transactions keep period NULL and are unaffected.

alter table public.savings_transactions
  add column if not exists period date;

create unique index if not exists savings_txn_account_period_uniq
  on public.savings_transactions (account_id, period)
  where period is not null;
