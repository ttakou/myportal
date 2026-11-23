-- The catering contractor's own staff (Pellegrini) are on the meal sheet as a
-- group of their own: listed last, with no meal ticked.
alter table public.offshore_meal_entries drop constraint if exists offshore_meal_entries_category_check;
alter table public.offshore_meal_entries
  add constraint offshore_meal_entries_category_check
  check (category in ('staff','visitor','casual','caterer'));
