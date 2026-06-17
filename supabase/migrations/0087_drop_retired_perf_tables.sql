-- 0087: Drop retired performance tables (OKRs, continuous feedback, 9-box grid).
--
-- The OKR objectives/key-results, peer feedback, and 9-box talent grid features
-- were retired in favour of the annual appraisal module. Their application code
-- has been removed; this drops the now-orphaned tables. CASCADE clears the
-- attached indexes, RLS policies, updated_at triggers, and audit triggers.
--
-- Drop order is FK-safe (okr_key_results -> okr_objectives), and CASCADE makes
-- it robust regardless.

drop table if exists public.okr_key_results cascade;
drop table if exists public.okr_objectives cascade;
drop table if exists public.perf_feedback cascade;
drop table if exists public.nine_box cascade;
