-- =============================================================================
-- PGM — a new functional role.
--
-- The PGM records the rating that stands once Annual Calibration has closed, at
-- the Final Appraisal phase. HR admins may record it too, so the stage is owned
-- by the PGM role and HR admins are treated as holding it; see workflow-runtime.
--
-- A new enum value cannot be USED in the same transaction that adds it, so this
-- migration only introduces the value (mirrors 0155 for `dispatcher`).
-- =============================================================================

alter type public.functional_role add value if not exists 'pgm';
