-- =============================================================================
-- Offshore Dispatcher — a new functional role.
--
-- The Dispatcher runs the day-to-day movements offshore: crew rotations, travel
-- & manifests, and the offshore-staff roster (full control), with read-only
-- sight of POB / live board and accommodation. It sits alongside Campboss / OIM
-- as a capability role that drives `getAccess()` flags.
--
-- A new enum value cannot be USED in the same transaction that adds it, so this
-- migration only introduces the value (mirrors 0050 for `oim` and 0100 for
-- `campboss`). It is wired to a reusable "Dispatcher" access role in 0156.
-- =============================================================================

alter type public.functional_role add value if not exists 'dispatcher';
