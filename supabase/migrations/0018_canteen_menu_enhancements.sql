-- Richer menu data + weekly/monthly planning + photo storage.
alter table public.canteen_dishes
  add column if not exists ingredients text,
  add column if not exists allergens text[] not null default '{}',
  add column if not exists photo_url text,
  add column if not exists available boolean not null default true,
  add column if not exists change_note text;

create or replace function public.canteen_copy_menu(p_from date, p_to date)
returns integer language plpgsql security invoker set search_path = public as $$
declare d record; g record; v_dish uuid; v_group uuid; n integer := 0;
begin
  for d in select * from public.canteen_dishes where service_date = p_from loop
    insert into public.canteen_dishes
      (tenant_id, kitchen_id, service_date, meal_period, name, description, ingredients,
       allergens, photo_url, capacity, available, is_active)
    values
      (d.tenant_id, d.kitchen_id, p_to, d.meal_period, d.name, d.description, d.ingredients,
       d.allergens, d.photo_url, d.capacity, d.available, d.is_active)
    returning id into v_dish;
    n := n + 1;
    for g in select * from public.canteen_option_groups where dish_id = d.id loop
      insert into public.canteen_option_groups (dish_id, name, min_select, max_select, sort_order)
      values (v_dish, g.name, g.min_select, g.max_select, g.sort_order) returning id into v_group;
      insert into public.canteen_options (group_id, name, is_active, sort_order)
      select v_group, name, is_active, sort_order from public.canteen_options where group_id = g.id;
    end loop;
  end loop;
  return n;
end; $$;

insert into storage.buckets (id, name, public) values ('meal-photos','meal-photos', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='meal_photos_read') then
    create policy "meal_photos_read" on storage.objects for select using (bucket_id = 'meal-photos');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='meal_photos_insert') then
    create policy "meal_photos_insert" on storage.objects for insert to authenticated with check (bucket_id = 'meal-photos');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='meal_photos_update') then
    create policy "meal_photos_update" on storage.objects for update to authenticated using (bucket_id = 'meal-photos');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and policyname='meal_photos_delete') then
    create policy "meal_photos_delete" on storage.objects for delete to authenticated using (bucket_id = 'meal-photos');
  end if;
end$$;
