alter table public.savings_goals add column if not exists last_nudged_at timestamptz;

-- Nudge members whose savings goal is off track at their recent pace.
create or replace function public.nudge_savings_goals_behind()
returns void language plpgsql security definer set search_path = '' as $$
begin
  with g as (
    select sg.id as goal_id, sg.tenant_id, sg.profile_id, sg.target_amount, sg.target_date,
           coalesce(acc.balance, 0) as bal,
           coalesce(c.p, 0) as p,
           coalesce(nullif(t.settings->'savings'->>'annualRatePct','')::numeric, 7) / 1200 as r,
           greatest(0,
             (extract(year from sg.target_date)::int - extract(year from current_date)::int) * 12
             + (extract(month from sg.target_date)::int - extract(month from current_date)::int)) as n
    from public.savings_goals sg
    join public.tenants t on t.id = sg.tenant_id
    left join public.savings_accounts acc on acc.profile_id = sg.profile_id and acc.tenant_id = sg.tenant_id
    left join lateral (
      select sum(x.amount) / 12.0 as p
      from public.savings_transactions x
      join public.savings_accounts a2 on a2.id = x.account_id
      where a2.profile_id = sg.profile_id and a2.tenant_id = sg.tenant_id
        and x.kind = 'contribution'
        and coalesce(x.period, x.created_at::date) >= (date_trunc('month', current_date) - interval '11 months')::date
    ) c on true
    where sg.target_date >= current_date
      and (sg.last_nudged_at is null or sg.last_nudged_at < now() - interval '25 days')
  ),
  calc as (
    select *,
      case when n <= 0 then bal
           when r = 0 then bal + p * n
           else bal * power(1 + r, n) + p * ((power(1 + r, n) - 1) / r) end as projected
    from g
  ),
  behind as (select * from calc where projected < target_amount),
  ins as (
    insert into public.notifications (tenant_id, profile_id, category, title, body, url)
    select tenant_id, profile_id, 'general', 'Savings goal off track',
      'At your current pace you''ll reach about ' || round(projected) || ' XAF by ' ||
        to_char(target_date, 'YYYY-MM-DD') || ', short of your ' || round(target_amount) ||
        ' XAF goal. Open the Savings Forecast to see how much more to save.',
      '/savings?view=forecast'
    from behind
    returning 1
  )
  update public.savings_goals sg set last_nudged_at = now()
  where sg.id in (select goal_id from behind);
end;
$$;

-- Remind savings admins to upload the month's contribution sheet if none yet.
create or replace function public.remind_savings_import()
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (tenant_id, profile_id, category, title, body, url)
  select distinct t.id, p.id, 'general', 'Monthly savings import due',
    'No savings contributions have been imported for ' || to_char(current_date, 'YYYY-MM') ||
      ' yet. Upload this month''s sheet in Savings → Administration.',
    '/savings?view=admin'
  from public.tenants t
  join public.profiles p on p.tenant_id = t.id and p.is_active
  left join public.profile_roles pr on pr.profile_id = p.id
  where exists (select 1 from public.savings_accounts a where a.tenant_id = t.id)
    and not exists (
      select 1 from public.savings_transactions x
      where x.tenant_id = t.id and x.kind = 'contribution'
        and x.period = date_trunc('month', current_date)::date
    )
    and (p.role in ('tenant_admin', 'super_admin') or pr.role in ('finance', 'system_admin'))
    and not exists (
      select 1 from public.notifications n
      where n.profile_id = p.id and n.title = 'Monthly savings import due'
        and n.created_at > now() - interval '20 days'
    );
end;
$$;

-- Schedule via pg_cron (guarded for environments without the extension).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('savings-goal-nudge', '13 3 * * 1', $job$select public.nudge_savings_goals_behind();$job$);
    perform cron.schedule('savings-import-reminder', '11 3 25 * *', $job$select public.remind_savings_import();$job$);
  end if;
end $$;
