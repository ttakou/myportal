-- The balance trigger only knew about inserts: it added NEW.amount on every
-- INSERT, UPDATE and DELETE. Re-dating a transaction counted it twice, and a
-- delete (NEW is null) set the balance to null. Now an insert adds the
-- signed amount, a delete takes it back, and an update moves the difference
-- (a change of date alone leaves the balance as it is).
create or replace function public.savings_apply_txn()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old numeric := 0;
  v_new numeric := 0;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := case when old.kind = 'withdrawal' then -old.amount else old.amount end;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := case when new.kind = 'withdrawal' then -new.amount else new.amount end;
  end if;

  if tg_op = 'UPDATE' and old.account_id is distinct from new.account_id then
    update public.savings_accounts set balance = balance - v_old where id = old.account_id;
    update public.savings_accounts set balance = balance + v_new where id = new.account_id;
  elsif tg_op = 'DELETE' then
    update public.savings_accounts set balance = balance - v_old where id = old.account_id;
  elsif v_new - v_old <> 0 then
    update public.savings_accounts set balance = balance + (v_new - v_old) where id = new.account_id;
  end if;

  return coalesce(new, old);
end $$;
