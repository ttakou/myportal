-- =============================================================================
-- canteen_redeem_meal / canteen_unredeem_meal kept the default PUBLIC execute
-- grant from creation, so revoking only `anon` (in 0062) left them reachable
-- anonymously via PUBLIC. Drop the blanket PUBLIC grant and re-grant to
-- `authenticated` only — canteen staff call these and they self-guard with
-- is_canteen_staff().
-- =============================================================================

revoke execute on function public.canteen_redeem_meal(uuid, date, text) from public, anon;
grant  execute on function public.canteen_redeem_meal(uuid, date, text) to authenticated;

revoke execute on function public.canteen_unredeem_meal(uuid) from public, anon;
grant  execute on function public.canteen_unredeem_meal(uuid) to authenticated;
