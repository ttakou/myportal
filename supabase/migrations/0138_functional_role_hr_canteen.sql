-- HR Canteen functional role: owns canteen meal entitlements (daily access) and
-- has full consumption/feedback/forecast oversight.
alter type public.functional_role add value if not exists 'hr_canteen';
