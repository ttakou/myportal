-- Same-day booking cutoff: if canteen settings.cutoff_hour is set, bookings for
-- today close once that hour passes. (canteen_book redefined with the check.)
create or replace function public.canteen_book(
  p_dish_id uuid, p_guest_count integer default 0,
  p_guest_names text[] default '{}', p_option_ids uuid[] default '{}'
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_dish public.canteen_dishes%rowtype; v_uid uuid := auth.uid(); v_booking uuid; g record; v_cutoff integer;
begin
  if not exists (select 1 from public.profiles where id = v_uid and lunch_eligible and is_active) then
    raise exception 'You are not eligible for lunch booking. Contact HR.';
  end if;
  select * into v_dish from public.canteen_dishes where id = p_dish_id;
  if not found or not v_dish.is_active then raise exception 'Dish is not available'; end if;
  if not v_dish.available then raise exception 'This dish is currently unavailable'; end if;

  select (ts.settings ->> 'cutoff_hour')::int into v_cutoff
  from public.tenant_services ts join public.services_catalog sc on sc.id = ts.service_id
  where sc.slug = 'canteen' and ts.tenant_id = v_dish.tenant_id;
  if v_cutoff is not null and v_dish.service_date = current_date and extract(hour from now()) >= v_cutoff then
    raise exception 'Booking for today closed at %:00', v_cutoff;
  end if;

  if exists (select 1 from unnest(coalesce(p_option_ids, '{}')) as u(oid)
    where u.oid not in (select o.id from public.canteen_options o
      join public.canteen_option_groups grp on grp.id = o.group_id
      where grp.dish_id = p_dish_id and o.is_active))
  then raise exception 'One or more options are invalid for this dish'; end if;

  for g in
    select grp.name, grp.min_select, grp.max_select,
      (select count(*) from public.canteen_options o2 where o2.group_id = grp.id and o2.is_active) as opt_count,
      (select count(*) from unnest(coalesce(p_option_ids,'{}')) as u(oid)
         join public.canteen_options o on o.id = u.oid where o.group_id = grp.id) as chosen
    from public.canteen_option_groups grp where grp.dish_id = p_dish_id
  loop
    if g.opt_count = 0 then continue; end if;
    if g.chosen < g.min_select then raise exception 'Choose at least % option(s) for %', g.min_select, g.name; end if;
    if g.chosen > g.max_select then raise exception 'Choose at most % option(s) for %', g.max_select, g.name; end if;
  end loop;

  update public.canteen_bookings set status = 'cancelled'
   where profile_id = v_uid and service_date = v_dish.service_date
     and meal_period = v_dish.meal_period and status <> 'cancelled';
  insert into public.canteen_bookings (profile_id, dish_id, guest_count, guest_names)
  values (v_uid, p_dish_id, greatest(0, least(10, coalesce(p_guest_count, 0))), coalesce(p_guest_names, '{}'))
  returning id into v_booking;
  if array_length(p_option_ids, 1) is not null then
    insert into public.canteen_booking_options (booking_id, option_id)
    select v_booking, u.oid from unnest(p_option_ids) as u(oid);
  end if;
  return v_booking;
end; $$;
