-- =============================================================================
-- Hardening: missing FK indexes, grant lockdown, integrity triggers, and a
-- date clamp on meal redemption. (Advisory P1/P2 items.)
-- =============================================================================

-- 1. Missing foreign-key indexes (avoid sequential scans as data grows).
create index if not exists idx_offshore_staff_fixed_room
  on public.offshore_staff(fixed_room_id);
create index if not exists idx_offshore_staff_back_to_back
  on public.offshore_staff(back_to_back_id);
create index if not exists idx_eess_incidents_reporter
  on public.eess_incidents(reporter_id);

-- 2. Prevent duplicate real emails (NULL allowed for pending accounts).
create unique index if not exists idx_profiles_email_unique
  on public.profiles(email) where email is not null;

-- 3. Lock down legacy SECURITY DEFINER helpers from API roles (advisor).
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.notify_cert_expiry() from public, anon, authenticated;

-- 4. Keep the denormalised savings balance correct on edits/deletes, not just
--    inserts (previously an UPDATE/DELETE silently drifted the balance).
create or replace function public.savings_apply_txn()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.savings_accounts
       set balance = balance + (case when new.kind = 'contribution' then new.amount else -new.amount end)
     where id = new.account_id;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    update public.savings_accounts
       set balance = balance - (case when old.kind = 'contribution' then old.amount else -old.amount end)
     where id = old.account_id;
  end if;
  return coalesce(new, old);
end; $$;
drop trigger if exists trg_savings_apply_txn on public.savings_transactions;
create trigger trg_savings_apply_txn
  after insert or update or delete on public.savings_transactions
  for each row execute function public.savings_apply_txn();

-- 5. Clamp the meal-redemption date to a sane window (defence in depth).
create or replace function public.canteen_redeem_meal(
  p_profile_id uuid,
  p_date date default current_date,
  p_note text default null
)
returns public.canteen_meal_redemptions
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant    uuid;
  v_effective integer;
  v_used      integer;
  v_row       public.canteen_meal_redemptions;
begin
  if not public.is_canteen_staff() then
    raise exception 'Only canteen staff can record meals.' using errcode = '42501';
  end if;
  if p_date > current_date + 7 or p_date < current_date - 31 then
    raise exception 'Meal date is out of range.';
  end if;

  select tenant_id into v_tenant from public.profiles where id = p_profile_id;
  if v_tenant is null then
    raise exception 'Unknown employee.';
  end if;
  if not public.is_super_admin() and v_tenant <> public.current_tenant_id() then
    raise exception 'Employee belongs to a different organisation.' using errcode = '42501';
  end if;

  v_effective := public.canteen_effective_meals(p_profile_id, p_date);
  if v_effective <= 0 then
    raise exception 'No meal entitlement for this date.';
  end if;

  select count(*) into v_used from public.canteen_meal_redemptions
   where profile_id = p_profile_id and redeemed_on = p_date;
  if v_used >= v_effective then
    raise exception 'Daily meal entitlement already used (% of %).', v_used, v_effective;
  end if;

  insert into public.canteen_meal_redemptions (tenant_id, profile_id, redeemed_on, redeemed_by, note)
  values (v_tenant, p_profile_id, p_date, auth.uid(), p_note)
  returning * into v_row;
  return v_row;
end; $$;
