-- 0081: Lookup so a stakeholder's submitted rating can notify the line manager.
-- The reviewer isn't a participant on the appraisal, so they can't read its
-- manager via RLS; this SECURITY DEFINER function returns just the notification
-- target for an assignment the caller actually owns.

create or replace function public.goal_rating_target(p_assignment uuid)
returns table (tenant_id uuid, manager_id uuid, employee_name text, goal_title text)
language sql stable security definer set search_path = public as $$
  select a.tenant_id, a.manager_id, e.full_name, g.title
  from public.appraisal_goal_raters r
  join public.appraisals      a on a.id = r.appraisal_id
  join public.appraisal_goals g on g.id = r.goal_id
  join public.profiles        e on e.id = a.employee_id
  where r.id = p_assignment and r.rater_id = auth.uid();
$$;
revoke execute on function public.goal_rating_target(uuid) from anon;
