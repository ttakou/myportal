-- =============================================================================
-- One-off cleanup: normalise every bed label to the positional "Bed N".
--
-- The estate carried three schemes at once — positional labels, bare numbers
-- imported from elsewhere (13, 40, 75, 90 …) and bottom/top (B/T) — with 12
-- rooms using two of them simultaneously. The bare numbers looked like the
-- facility's own bunk numbering, but the berths carry no physical numbers: what
-- identifies a bed is only its room and the count of beds in that room. The
-- labels are therefore slot counters, and renumbering loses nothing.
--
-- Two tables have to move together. offshore_trips.bed_no is where a person
-- sleeps tonight; offshore_staff.fixed_bed is their permanent berth, which
-- auto-allocate honours first — renumbering only the former would let the old
-- labels return at the next crew change.
--
-- The previous values are copied to offshore_bed_renumber_backup_0166 first.
-- That table is a rollback record for this migration only and may be dropped
-- once the result has been accepted.
-- =============================================================================

create table if not exists public.offshore_bed_renumber_backup_0166 (
  source      text not null,          -- 'trip' | 'roster'
  row_id      uuid not null,
  room_id     uuid,
  old_value   text,
  taken_at    timestamptz not null default now(),
  primary key (source, row_id)
);

insert into public.offshore_bed_renumber_backup_0166 (source, row_id, room_id, old_value)
select 'trip', t.id, t.room_id, t.bed_no
  from public.offshore_trips t
 where t.status = 'onboard' and t.room_id is not null
on conflict (source, row_id) do nothing;

insert into public.offshore_bed_renumber_backup_0166 (source, row_id, room_id, old_value)
select 'roster', s.id, s.fixed_room_id, s.fixed_bed
  from public.offshore_staff s
 where s.fixed_room_id is not null
on conflict (source, row_id) do nothing;

-- ---- 1. Live occupancy ------------------------------------------------------
-- Anyone already on a valid, unique "Bed N" within the room keeps it, so the
-- change is as small as possible; everyone else takes the lowest free slot.
-- Duplicates therefore separate, and blanks get a bed. Where a room holds more
-- people than berths the numbering runs past bed_count rather than dropping
-- anyone — the over-capacity stays visible instead of being papered over.
with base as (
  select t.id, t.room_id, t.bed_no, r.bed_count,
         case when t.bed_no ~* '^bed[ _-]*0*[0-9]+$'
              then nullif(regexp_replace(t.bed_no, '\D', '', 'g'), '')::int end as pos,
         nullif(regexp_replace(coalesce(t.bed_no, ''), '\D', '', 'g'), '')::int as num
  from public.offshore_trips t
  join public.offshore_rooms r on r.id = t.room_id
  where t.status = 'onboard'
),
keepers as (
  select *, row_number() over (partition by room_id, pos order by id) as rn
  from base where pos between 1 and bed_count
),
kept as (select id, room_id, pos from keepers where rn = 1),
tofix as (select b.* from base b where not exists (select 1 from kept k where k.id = b.id)),
cand as (
  select rm.id as room_id, g as n
  from public.offshore_rooms rm
  cross join lateral generate_series(1, greatest(rm.bed_count, 40)) g
  where not exists (select 1 from kept k where k.room_id = rm.id and k.pos = g)
),
cand_ranked as (select room_id, n, row_number() over (partition by room_id order by n) rn from cand),
tofix_ranked as (
  select id, room_id,
         row_number() over (partition by room_id order by num nulls last, bed_no, id) rn
  from tofix
)
update public.offshore_trips t
   set bed_no = 'Bed ' || c.n
  from tofix_ranked f
  join cand_ranked c on c.room_id = f.room_id and c.rn = f.rn
 where t.id = f.id;

-- ---- 2. Permanent berths ----------------------------------------------------
-- Grouped by the OLD value, so two people who shared a berth (a back-to-back
-- pair on opposite rotations) still share it afterwards. Verified beforehand
-- that no room has more distinct fixed beds than it has berths. A roster row
-- with no fixed bed keeps none — that is "no permanent berth", not bed 1.
with distinct_beds as (
  select distinct fixed_room_id, fixed_bed
    from public.offshore_staff
   where fixed_room_id is not null and fixed_bed is not null
),
numbered as (
  select fixed_room_id, fixed_bed,
         row_number() over (
           partition by fixed_room_id
           order by nullif(regexp_replace(fixed_bed, '\D', '', 'g'), '')::int nulls last, fixed_bed
         ) as n
  from distinct_beds
)
update public.offshore_staff s
   set fixed_bed = 'Bed ' || nm.n
  from numbered nm
 where s.fixed_room_id = nm.fixed_room_id
   and s.fixed_bed = nm.fixed_bed;
