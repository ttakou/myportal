-- Effective-dated configuration: config objects carry versioning + effective
-- dates + publish metadata so changes never alter completed historical
-- assessments. (Cycles already snapshot rating bands/weights at launch; this
-- adds the version lineage and effective windows that govern NEW cycles.)

do $$
declare tbl text;
begin
  foreach tbl in array array['rating_scales','cycle_templates','goal_templates']
  loop
    execute format('alter table public.%I
      add column if not exists effective_from date,
      add column if not exists effective_to   date,
      add column if not exists version        integer not null default 1,
      add column if not exists status          text not null default ''published'',
      add column if not exists published_at    timestamptz,
      add column if not exists published_by    uuid references public.profiles(id) on delete set null', tbl);
    execute format('alter table public.%I drop constraint if exists %I', tbl, tbl || '_status_chk');
    execute format('alter table public.%I add constraint %I check (status in (''draft'',''published'',''archived''))', tbl, tbl || '_status_chk');
  end loop;
end $$;

-- Stamp existing rows as published now (they are live config).
update public.rating_scales  set published_at = coalesce(published_at, now()) where status = 'published';
update public.cycle_templates set published_at = coalesce(published_at, now()) where status = 'published';
update public.goal_templates  set published_at = coalesce(published_at, now()) where status = 'published';
