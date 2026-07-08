-- =============================================================================
-- Tighten two training self-service RLS policies surfaced in code review.
-- =============================================================================

-- 1) A line manager raising a request for a direct report must not be able to
--    set an arbitrary status (e.g. 'approved') and bypass the approval chain.
--    Allow only the legitimate initial states.
drop policy if exists "training_requests_insert_manager" on public.training_requests;
create policy "training_requests_insert_manager" on public.training_requests for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_my_training_report(profile_id)
    and status in ('requested','manager_approved')
  );

-- 2) Self-update of one's own participant row must be limited to withdrawing
--    (status -> 'cancelled'). The previous policy allowed any self-update, so a
--    user could fabricate attendance ('attended'/'passed') for a session.
drop policy if exists "training_participants_update_self" on public.training_participants;
create policy "training_participants_update_self" on public.training_participants for update to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and tenant_id = public.current_tenant_id()
    and status = 'cancelled'
  );
