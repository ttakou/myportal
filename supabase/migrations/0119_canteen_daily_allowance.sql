-- Enforce each person's daily meal allowance at the source — both self-booking
-- (canteen_book) and the serving point (serveWalkin / mark-collected) write to
-- canteen_bookings, so a single BEFORE trigger on that table guards every path.
--
-- Allowance for a person on a date = the sum of entitlement grants covering that
-- date (canteen_meal_entitlements.daily_meals). When the person has no grant for
-- the date we fall back to the simple gate: lunch-eligible + active => 1 meal,
-- otherwise 0. So the default is "one meal per day", and an explicit grant with
-- daily_meals > 1 raises the cap. Previously only the lunch_eligible boolean was
-- checked, so nothing stopped a second meal in a day.

create or replace function public.canteen_daily_allowance(p_profile uuid, p_date date)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select sum(e.daily_meals)::int
       from public.canteen_meal_entitlements e
      where e.profile_id = p_profile
        and p_date between e.starts_on and e.ends_on),
    (select case when exists (
        select 1 from public.profiles
         where id = p_profile and lunch_eligible and is_active
      ) then 1 else 0 end),
    0
  );
$$;

create or replace function public.canteen_enforce_daily_allowance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_date  date;
  v_allow int;
  v_used  int;
begin
  -- Cancelled rows never consume allowance.
  if NEW.status = 'cancelled' then
    return NEW;
  end if;

  -- Only enforce when this operation INTRODUCES a new live booking: an insert,
  -- or an update that un-cancels a row. Plain updates of an already-live booking
  -- (mark collected, edit guests, finalize) are not new consumption and must not
  -- be blocked — otherwise the serving point couldn't collect existing meals.
  if TG_OP = 'UPDATE' and OLD.status <> 'cancelled' then
    return NEW;
  end if;

  -- service_date is filled from the dish by trg_canteen_fill_booking; resolve it
  -- defensively so this trigger is independent of firing order.
  v_date := coalesce(
    NEW.service_date,
    (select service_date from public.canteen_dishes where id = NEW.dish_id)
  );
  if v_date is null then
    return NEW;
  end if;

  v_allow := public.canteen_daily_allowance(NEW.profile_id, v_date);

  -- Count this person's other live bookings for the same day (any meal period).
  select count(*) into v_used
    from public.canteen_bookings b
   where b.profile_id = NEW.profile_id
     and b.service_date = v_date
     and b.status <> 'cancelled'
     and b.id <> NEW.id;

  if v_used >= v_allow then
    raise exception 'Daily meal allowance reached (% per day) for this person.', v_allow
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

-- Fire after the dish-fill trigger (name sorts after trg_canteen_fill_booking),
-- though the function resolves the date defensively regardless.
drop trigger if exists trg_canteen_quota on public.canteen_bookings;
create trigger trg_canteen_quota
  before insert or update on public.canteen_bookings
  for each row execute function public.canteen_enforce_daily_allowance();
