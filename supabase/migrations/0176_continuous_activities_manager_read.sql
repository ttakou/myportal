-- Let a line manager read their reports' continuous entries.
--
-- The select policy allowed the author, the subject, the counterpart, HR and
-- tenant admins — and no manager. So surfacing goal updates and recognition on
-- the team card worked for HR and returned nothing for the line manager it was
-- built for: the rows were filtered out beneath the query, silently, which
-- looks exactly like having posted nothing.
--
-- Private entries stay private to their author, here as everywhere.

drop policy if exists continuous_activities_select on public.continuous_activities;

create policy continuous_activities_select on public.continuous_activities
for select using (
  (select public.is_super_admin())
  or (
    tenant_id = (select public.current_tenant_id())
    and (
      author_id = (select auth.uid())
      or (subject_id = (select auth.uid()) and not is_private)
      or counterpart_id = (select auth.uid())
      or ((select public.is_hr()) or (select public.is_tenant_admin())) and not is_private
      -- A line manager reads their own reports' entries, and anybody who
      -- nominated them as appraisal delegate. Reviewing somebody without
      -- seeing what they posted is reviewing from memory.
      or (
        not is_private
        and exists (
          select 1 from public.profiles p
          where p.id = continuous_activities.subject_id
            and (
              p.manager_id = (select auth.uid())
              or exists (
                select 1 from public.profiles m
                where m.id = p.manager_id
                  and m.appraisal_delegate_id = (select auth.uid())
              )
            )
        )
      )
    )
  )
);
