-- =============================================================================
-- Harden EXECUTE grants on the meal-entitlement functions.
--
-- Supabase grants EXECUTE to anon/authenticated by default for new functions in
-- the public schema, so `revoke ... from public` alone leaves those explicit
-- grants in place. Tighten the SECURITY DEFINER helpers accordingly.
-- =============================================================================

-- Internal helper only (called inside canteen_redeem_meal) — never over the API.
revoke execute on function public.canteen_effective_meals(uuid, date)
  from public, anon, authenticated;

-- Staff-facing RPCs: keep `authenticated` (guarded internally by
-- is_canteen_staff()), but drop the anonymous grant.
revoke execute on function public.canteen_redeem_meal(uuid, date, text) from anon;
revoke execute on function public.canteen_unredeem_meal(uuid) from anon;

-- Platform cron only: callable by the service role, never by API users.
revoke execute on function public.canteen_run_monthly_renewal() from anon, authenticated;
