-- Granular per-module permissions for access roles.
-- Each role gains a `permissions` JSONB of shape { "<module>": ["view","create",...] }.
-- `module_slugs` is retained as the view-visibility list (kept in sync by the app)
-- so existing sidebar/middleware gating keeps working unchanged.

alter table public.tenant_roles
  add column if not exists permissions jsonb not null default '{}'::jsonb;

-- Backfill: every already-granted module becomes full access (limited to the
-- verbs that apply to that module), so current behaviour is preserved.
update public.tenant_roles tr
set permissions = coalesce((
  select jsonb_object_agg(slug, verbs)
  from (
    select s as slug,
      case s
        when 'emergency'      then '["view","create","approve","manage"]'::jsonb
        when 'canteen'        then '["view","create","edit","approve","operate","manage"]'::jsonb
        when 'transportation' then '["view","create","edit","approve","operate","manage"]'::jsonb
        when 'out-of-town'    then '["view","create","edit","approve","operate","manage"]'::jsonb
        when 'offshore'       then '["view","create","edit","approve","operate","manage"]'::jsonb
        when 'visitors'       then '["view","create","edit","operate"]'::jsonb
        when 'medical'        then '["view","create","manage"]'::jsonb
        when 'savings'        then '["view","create","approve","operate"]'::jsonb
        when 'performance'    then '["view","create","edit","approve"]'::jsonb
        else '["view"]'::jsonb
      end as verbs
    from unnest(tr.module_slugs) as s
  ) x
), '{}'::jsonb)
where tr.permissions = '{}'::jsonb
  and coalesce(array_length(tr.module_slugs, 1), 0) > 0;
