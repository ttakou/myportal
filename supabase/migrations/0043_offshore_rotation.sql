-- =============================================================================
-- Offshore rotation calendar support.
--   * crews get a cycle anchor (start of an offshore period) so the system can
--     generate the offshore/onshore windows and the next crew-change date.
--   * staff get a company/contractor (APCC, TEFON, PELLEGRINI…) as on the
--     real crew-change sheet. (back_to_back_id already exists.)
-- =============================================================================

alter table public.offshore_crews
  add column if not exists cycle_start_date date;

alter table public.offshore_staff
  add column if not exists company text;
