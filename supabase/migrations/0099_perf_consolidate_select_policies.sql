-- Performance: collapse duplicate permissive SELECT policies into one.
--
-- Postgres already OR's permissive policies for the same command, but it plans
-- and evaluates each as a separate subquery per row (the advisor's
-- multiple_permissive_policies lint). These three tables each had THREE
-- permissive SELECT policies; merging them into a single policy whose USING is
-- the OR of the originals is exactly equivalent and lets the planner evaluate
-- one expression. The member quals are reproduced verbatim (they were already
-- init-plan-optimised with `(select auth.uid())`), so visibility is unchanged.
-- Scoped deliberately to these three clear cases; complex multi-policy tables
-- are left untouched. Applied to the database.

-- transport_requests: admin OR assigned-driver OR own
drop policy if exists transport_requests_select_admin on public.transport_requests;
drop policy if exists transport_requests_select_driver on public.transport_requests;
drop policy if exists transport_requests_select_own on public.transport_requests;
create policy transport_requests_select on public.transport_requests
  for select to authenticated
  using (
    ((tenant_id = (select current_tenant_id())) and (select is_tenant_admin()))
    or (exists (
      select 1 from transport_drivers d
      where d.id = transport_requests.driver_id and d.profile_id = (select auth.uid())
    ))
    or (requester_id = (select auth.uid()))
  );

-- visitors: admin OR host/creator OR visitors:operate holder
drop policy if exists visitors_select_admin on public.visitors;
drop policy if exists visitors_select_host on public.visitors;
drop policy if exists visitors_select_operate on public.visitors;
create policy visitors_select on public.visitors
  for select to authenticated
  using (
    ((tenant_id = (select current_tenant_id())) and (select is_tenant_admin()))
    or ((host_id = (select auth.uid())) or (created_by = (select auth.uid())))
    or ((tenant_id = current_tenant_id()) and has_module_permission('visitors'::text, 'operate'::text))
  );

-- out_of_town_trips: admin OR requester's line-manager OR own
drop policy if exists oott_select_admin on public.out_of_town_trips;
drop policy if exists oott_select_manager on public.out_of_town_trips;
drop policy if exists oott_select_own on public.out_of_town_trips;
create policy oott_select on public.out_of_town_trips
  for select to authenticated
  using (
    ((tenant_id = (select current_tenant_id())) and (select is_tenant_admin()))
    or (exists (
      select 1 from profiles p
      where p.id = out_of_town_trips.requester_id and p.manager_id = (select auth.uid())
    ))
    or (requester_id = (select auth.uid()))
  );
