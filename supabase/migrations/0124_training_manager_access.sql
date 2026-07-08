-- Team Training: a line manager can read their direct reports' training data
-- (compliance, plan, enrolments) and approve/decline their reports' training
-- requests. "Direct report" = profiles.manager_id = the signed-in user.
--
-- A SECURITY DEFINER helper resolves the reporting line without exposing the
-- profiles table through these policies (and avoids RLS recursion).

create or replace function public.is_my_training_report(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p and manager_id = auth.uid()
  );
$$;

-- Managers may READ their reports' person-scoped training rows.
do $$
declare t text;
begin
  foreach t in array array[
    'training_records','training_plan_items','training_participants',
    'training_employee_competencies','training_requests'
  ] loop
    execute format($p$drop policy if exists "%1$s_select_report" on public.%1$s$p$, t);
    execute format($p$create policy "%1$s_select_report" on public.%1$s for select to authenticated
      using (public.is_my_training_report(profile_id))$p$, t);
  end loop;
end$$;

-- Managers may UPDATE their reports' requests (to approve / decline).
drop policy if exists "training_requests_update_manager" on public.training_requests;
create policy "training_requests_update_manager" on public.training_requests for update to authenticated
  using (public.is_my_training_report(profile_id))
  with check (public.is_my_training_report(profile_id));
