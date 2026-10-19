-- Team attendance: a line manager or director sees the attendance of everybody
-- below them in the reporting line (profiles.manager_id), directs and their
-- reports all the way down. Read-only: checking in and out stays with security
-- and the person themselves.

-- Whether `p` sits anywhere below the caller in the reporting line. Walks up
-- from `p`, so the cost is the depth of the line, not the size of the team.
-- The depth cap also stops a loop in the line (A reports to B reports to A).
create or replace function public.is_in_my_line(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up as (
    select id, manager_id, 0 as d
    from public.profiles
    where id = p
    union all
    select pr.id, pr.manager_id, up.d + 1
    from public.profiles pr
    join up on pr.id = up.manager_id
    where up.d < 12
  )
  select p is distinct from (select auth.uid())
     and exists (select 1 from up where manager_id = (select auth.uid()));
$$;

revoke execute on function public.is_in_my_line(uuid) from public, anon;
grant execute on function public.is_in_my_line(uuid) to authenticated;

drop policy if exists "staff_attendance_line" on public.staff_attendance;
create policy "staff_attendance_line" on public.staff_attendance
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_in_my_line(profile_id));

-- The people below a manager, for the team attendance report: each with their
-- place in the line and, for rotational offshore staff, their crew's cycle so
-- a day off-rotation reads as such rather than as an absence. The schedule is
-- the crew's, never the trips'.
--
-- `p_manager` defaults to the caller. Anyone else's line is open only to
-- tenant administrators; for everybody else it returns nothing.
create or replace function public.team_line(p_manager uuid default null)
returns table (
  profile_id uuid,
  full_name text,
  department text,
  job_title text,
  manager_id uuid,
  manager_name text,
  depth int,
  is_rotational boolean,
  crew_name text,
  offshore_days int,
  onshore_days int,
  cycle_start_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive root as (
    select coalesce(p_manager, (select auth.uid())) as id
    where p_manager is null
       or p_manager = (select auth.uid())
       or public.is_tenant_admin()
  ),
  line as (
    select pr.id, pr.manager_id, 1 as depth
    from public.profiles pr
    join root on pr.manager_id = root.id
    where pr.tenant_id = public.current_tenant_id() and pr.is_active
    union
    select pr.id, pr.manager_id, line.depth + 1
    from public.profiles pr
    join line on pr.manager_id = line.id
    where pr.tenant_id = public.current_tenant_id() and pr.is_active and line.depth < 12
  ),
  firsts as (
    select distinct on (id) id, manager_id, depth from line order by id, depth
  )
  select
    pr.id,
    pr.full_name,
    pr.department,
    pr.job_title,
    f.manager_id,
    m.full_name,
    f.depth,
    coalesce(os.is_rotational, true) and os.id is not null and c.cycle_start_date is not null,
    c.name,
    c.offshore_days,
    c.onshore_days,
    c.cycle_start_date
  from firsts f
  join public.profiles pr on pr.id = f.id
  left join public.profiles m on m.id = f.manager_id
  left join public.offshore_staff os on os.profile_id = pr.id
  left join public.offshore_crews c on c.id = os.crew_id
  where pr.id <> (select id from root)
  order by f.depth, pr.full_name;
$$;

revoke execute on function public.team_line(uuid) from public, anon;
grant execute on function public.team_line(uuid) to authenticated;
