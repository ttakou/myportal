-- Monthly interest accrual posts a third kind of savings transaction.
alter type public.savings_txn_kind add value if not exists 'interest';
