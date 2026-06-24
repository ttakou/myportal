-- Hardening for training requests + completion records.
--
-- 1. Let an employee cancel their OWN pending request. The person-scoped policies
--    only granted owners SELECT (not UPDATE), so the cancel button silently did
--    nothing. This policy permits exactly one transition — to 'cancelled', from a
--    cancellable state — so an owner can't, say, self-approve.
drop policy if exists "training_requests_cancel_own" on public.training_requests;
create policy "training_requests_cancel_own" on public.training_requests for update to authenticated
  using (profile_id = auth.uid() and status in ('requested','manager_approved'))
  with check (profile_id = auth.uid() and status = 'cancelled');

-- 2. One completion record per person per session — prevents duplicate
--    certificates from a double "Record completion" (the app guard had a race).
create unique index if not exists training_records_session_profile_uniq
  on public.training_records (session_id, profile_id)
  where session_id is not null;
