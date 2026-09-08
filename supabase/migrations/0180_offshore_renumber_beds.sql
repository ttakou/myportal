-- Rename the beds of every room "Bed 1" to "Bed N".
--
-- Three bed conventions lived side by side: "Bed 1", the facility's painted
-- bunk numbers, and bottom/top ("B"/"T") in two-berth cabins; 65 of the 112
-- people on board with a room had no bed at all, and some berths held two.
-- One convention from here: "Bed 1" to "Bed N" per room, N the room's bed
-- count. The function below does it for one room or all, keeps a valid label
-- where one exists, gives the blanks and the clashes the lowest free berth,
-- anchors a cabin owner's fixed bed on the bed they are in today, and lets
-- back-to-backs share a berth. It reports what it would do before it does
-- it (p_apply = false), and is what the "Renumber beds" button calls.

create or replace function public.offshore_bed_index(p_label text, p_beds int)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when p_label is null then null
    when btrim(p_label) ~* '^bed\s*[0-9]+$'
      then case when regexp_replace(btrim(p_label), '\D', '', 'g')::int between 1 and p_beds
                then regexp_replace(btrim(p_label), '\D', '', 'g')::int end
    when btrim(p_label) ~ '^[0-9]+$'
      then case when btrim(p_label)::int between 1 and p_beds then btrim(p_label)::int end
    when upper(btrim(p_label)) = 'B' and p_beds = 2 then 1
    when upper(btrim(p_label)) = 'T' and p_beds = 2 then 2
    else null
  end
$$;

create or replace function public.offshore_renumber_beds(p_room_id uuid default null, p_apply boolean default false)
returns table(kind text, room_label text, person text, old_bed text, new_bed text)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  r record;
  t record;
  o record;
  n int;
  k int;
  used int[];
  free_k int;
begin
  create temp table if not exists _rb_trips(
    trip_id uuid, profile_id uuid, person text, old_bed text, k int, new_k int
  ) on commit drop;
  create temp table if not exists _rb_owners(
    staff_id uuid, profile_id uuid, person text, old_bed text, b2b uuid, crew_id uuid, k int, new_k int
  ) on commit drop;

  for r in
    select rm.id, rm.room_number, rm.block, rm.bed_count
      from public.offshore_rooms rm
     where p_room_id is null or rm.id = p_room_id
     order by rm.block nulls first, rm.room_number
  loop
    n := greatest(coalesce(r.bed_count, 0), 0);
    delete from _rb_trips;
    delete from _rb_owners;

    -- People on board in this room, with the berth their label already names.
    insert into _rb_trips(trip_id, profile_id, person, old_bed, k)
    select tr.id, tr.profile_id, coalesce(p.full_name, tr.person_name, '—'), tr.bed_no,
           public.offshore_bed_index(tr.bed_no, n)
      from public.offshore_trips tr
      left join public.profiles p on p.id = tr.profile_id
     where tr.room_id = r.id and tr.status = 'onboard';

    used := '{}';
    -- A valid berth is kept by the first person holding it.
    for t in select * from _rb_trips where k is not null order by k, person loop
      if not (t.k = any(used)) then
        update _rb_trips set new_k = t.k where trip_id = t.trip_id;
        used := used || t.k;
      end if;
    end loop;
    -- Blanks, clashes and out-of-range labels take the lowest free berth.
    for t in select * from _rb_trips where new_k is null order by person loop
      free_k := (select min(g) from generate_series(1, n) g where not (g = any(used)));
      if free_k is not null then
        update _rb_trips set new_k = free_k where trip_id = t.trip_id;
        used := used || free_k;
      end if;
    end loop;

    -- Cabin owners: the roster's fixed beds.
    insert into _rb_owners(staff_id, profile_id, person, old_bed, b2b, crew_id, k)
    select s.id, s.profile_id, coalesce(p.full_name, p.email, '—'), s.fixed_bed, s.back_to_back_id, s.crew_id,
           public.offshore_bed_index(s.fixed_bed, n)
      from public.offshore_staff s
      left join public.profiles p on p.id = s.profile_id
     where s.fixed_room_id = r.id;

    -- Anchored on the bed they are in today.
    update _rb_owners o set new_k = tr.new_k
      from _rb_trips tr
     where tr.profile_id = o.profile_id and tr.new_k is not null;
    select coalesce(array_agg(distinct new_k), '{}') into used from _rb_owners where new_k is not null;

    -- A valid fixed bed is kept. Two owners may hold one berth when they are
    -- back-to-backs or on different crews: the crews alternate, so the berth
    -- is never wanted twice at once.
    for o in select * from _rb_owners where new_k is null and k is not null order by k, person loop
      if not (o.k = any(used)) then
        update _rb_owners set new_k = o.k where staff_id = o.staff_id;
        used := used || o.k;
      elsif (select count(*) from _rb_owners x where x.new_k = o.k) = 1 and exists (
        select 1 from _rb_owners x
         where x.new_k = o.k and x.staff_id <> o.staff_id
           and (x.profile_id = o.b2b or x.b2b = o.profile_id or x.crew_id is distinct from o.crew_id)
      ) then
        update _rb_owners set new_k = o.k where staff_id = o.staff_id;
      end if;
    end loop;

    -- A back-to-back without a bed joins their opposite number's, if it is not already shared.
    for o in select * from _rb_owners where new_k is null and b2b is not null order by person loop
      select x.new_k into k
        from _rb_owners x
       where x.profile_id = o.b2b and x.new_k is not null
         and not exists (select 1 from _rb_owners y where y.new_k = x.new_k and y.staff_id <> x.staff_id);
      if k is not null then
        update _rb_owners set new_k = k where staff_id = o.staff_id;
      end if;
    end loop;

    -- The rest take the lowest free berth; past capacity, the lowest berth held
    -- by one owner of another crew; failing that they stay without one.
    for o in select * from _rb_owners where new_k is null order by person loop
      free_k := (select min(g) from generate_series(1, n) g where not (g = any(used)));
      if free_k is null then
        select min(x.new_k) into free_k
          from _rb_owners x
         where x.new_k is not null and x.crew_id is distinct from o.crew_id
           and (select count(*) from _rb_owners y where y.new_k = x.new_k) = 1;
        if free_k is not null then
          update _rb_owners set new_k = free_k where staff_id = o.staff_id;
        end if;
      else
        update _rb_owners set new_k = free_k where staff_id = o.staff_id;
        used := used || free_k;
      end if;
    end loop;

    -- Report every change and every overflow.
    for t in
      select * from _rb_trips
       where new_k is null or old_bed is distinct from ('Bed ' || new_k)
       order by person
    loop
      kind := case when t.new_k is null then 'trip_overflow' else 'trip' end;
      room_label := coalesce(r.block || ' ', '') || r.room_number;
      person := t.person;
      old_bed := t.old_bed;
      new_bed := case when t.new_k is null then null else 'Bed ' || t.new_k end;
      return next;
    end loop;
    for o in
      select * from _rb_owners
       where new_k is null or old_bed is distinct from ('Bed ' || new_k)
       order by person
    loop
      kind := case when o.new_k is null then 'owner_overflow' else 'owner' end;
      room_label := coalesce(r.block || ' ', '') || r.room_number;
      person := o.person;
      old_bed := o.old_bed;
      new_bed := case when o.new_k is null then null else 'Bed ' || o.new_k end;
      return next;
    end loop;

    if p_apply then
      update public.offshore_trips tr
         set bed_no = 'Bed ' || x.new_k
        from _rb_trips x
       where x.trip_id = tr.id and x.new_k is not null
         and tr.bed_no is distinct from ('Bed ' || x.new_k);
      update public.offshore_staff s
         set fixed_bed = 'Bed ' || x.new_k
        from _rb_owners x
       where x.staff_id = s.id and x.new_k is not null
         and s.fixed_bed is distinct from ('Bed ' || x.new_k);
    end if;
  end loop;
end;
$$;

-- Offshore managers call it from the "Renumber beds" button; RLS on the two
-- tables still decides what the caller may write.
revoke all on function public.offshore_renumber_beds(uuid, boolean) from public;
grant execute on function public.offshore_renumber_beds(uuid, boolean) to authenticated;
grant execute on function public.offshore_bed_index(text, int) to authenticated;

-- The one-off: every room, now.
select count(*) from public.offshore_renumber_beds(null, true);
