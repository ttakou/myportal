-- =============================================================================
-- Allow staff/accounts without an email (added later).
-- profiles.email becomes nullable; auth.users still gets a unique internal
-- login placeholder so the account exists, but profiles.email stays null until
-- a real address is set in the admin console.
-- =============================================================================

alter table public.profiles alter column email drop not null;
