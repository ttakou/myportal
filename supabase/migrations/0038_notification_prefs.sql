-- =============================================================================
-- Per-user notification preferences.
--
-- One row per (user, category) toggling in-app and push delivery. A missing
-- row means "on" for both, so existing users keep getting everything until
-- they opt out. Emergency alerts are safety-critical and ignored by the mute
-- logic in the app layer (no row here can switch them off).
-- =============================================================================

create table if not exists public.notification_preferences (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category   text not null
             check (category in ('transport','flight','approval','general')),
  in_app     boolean not null default true,
  push       boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (profile_id, category)
);

alter table public.notification_preferences enable row level security;

-- Users manage only their own preferences.
drop policy if exists "notif_prefs_select_own" on public.notification_preferences;
create policy "notif_prefs_select_own" on public.notification_preferences for select to authenticated
  using (profile_id = auth.uid());
drop policy if exists "notif_prefs_write_own" on public.notification_preferences;
create policy "notif_prefs_write_own" on public.notification_preferences for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
