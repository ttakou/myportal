-- Idempotent monthly interest accrual, callable by a scheduler. For every
-- savings account it posts the current month's interest (balance × tenant rate
-- ÷ 12, whole XAF) unless already posted, and writes one audit row per tenant.
-- The balance trigger credits each inserted interest transaction.
create or replace function public.accrue_monthly_savings_interest()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := date_trunc('month', current_date)::date;
begin
  with ins as (
    insert into public.savings_transactions (tenant_id, account_id, kind, amount, period, note)
    select a.tenant_id, a.id, 'interest'::public.savings_txn_kind,
           round(a.balance * (coalesce(nullif(t.settings->'savings'->>'annualRatePct','')::numeric, 7) / 1200)),
           v_period,
           'Monthly interest (auto)'
    from public.savings_accounts a
    join public.tenants t on t.id = a.tenant_id
    where round(a.balance * (coalesce(nullif(t.settings->'savings'->>'annualRatePct','')::numeric, 7) / 1200)) >= 1
      and not exists (
        select 1 from public.savings_transactions x
        where x.account_id = a.id and x.kind = 'interest' and x.period = v_period
      )
    returning tenant_id, amount
  )
  insert into public.savings_audit_log (tenant_id, actor_id, action, entity, summary, meta)
  select tenant_id, null, 'interest.run', 'interest',
         'Auto-accrued monthly interest — ' || count(*) || ' account(s), ' || sum(amount) || ' XAF',
         jsonb_build_object('auto', true, 'period', to_char(v_period, 'YYYY-MM'),
                            'accounts', count(*), 'total', sum(amount))
  from ins
  group by tenant_id;
end;
$$;

-- Schedule it monthly via pg_cron (enable the extension once at the project
-- level: `create extension if not exists pg_cron;`). Guarded so environments
-- without pg_cron (local/CI) skip scheduling.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'savings-monthly-interest',
      '7 2 1 * *',
      $job$select public.accrue_monthly_savings_interest();$job$
    );
  end if;
end $$;
