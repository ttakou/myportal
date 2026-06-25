-- Visitor plates count against the daily meal allowance, matching the serving
-- point. serveWalkin already rejects host+visitors beyond the allowance, but the
-- self-booking path didn't: the allowance trigger counted booking ROWS only (one
-- host plate each), so an employee could self-book a single dish with up to 10
-- guest plates regardless of a 1-meal allowance — and edit guests upward on a
-- live booking to bypass the check entirely.
--
-- Now each live booking counts as 1 (host) + guest_count (visitors), the row's
-- own host+visitors are included, and live-row updates are re-checked whenever
-- they ADD plates (e.g. more guests) while still letting non-additive updates
-- (mark collected, finalize, fewer guests) through untouched.

create or replace function public.canteen_enforce_daily_allowance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_date  date;
  v_allow int;
  v_used  int;
  v_this  int;
begin
  -- Cancelled rows never consume allowance.
  if NEW.status = 'cancelled' then
    return NEW;
  end if;

  -- For an already-live booking, only re-check when this change ADDS plates
  -- (more visitors). Non-additive updates (mark collected, finalize, edit guests
  -- downward) are not new consumption and must not be blocked — otherwise the
  -- serving point couldn't collect existing meals.
  if TG_OP = 'UPDATE' and OLD.status <> 'cancelled' then
    if coalesce(NEW.guest_count, 0) <= coalesce(OLD.guest_count, 0) then
      return NEW;
    end if;
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

  -- Plates already committed by this person's other live bookings today: each
  -- booking is its host plate (1) plus its visitor plates (guest_count).
  select coalesce(sum(1 + coalesce(b.guest_count, 0)), 0) into v_used
    from public.canteen_bookings b
   where b.profile_id = NEW.profile_id
     and b.service_date = v_date
     and b.status <> 'cancelled'
     and b.id <> NEW.id;

  -- This booking's own plates: the host plus its visitors.
  v_this := 1 + coalesce(NEW.guest_count, 0);

  if v_used + v_this > v_allow then
    raise exception
      'Daily meal allowance reached (% per day) for this person — host plate plus visitors would exceed it.', v_allow
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;
