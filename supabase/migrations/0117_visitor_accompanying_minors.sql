-- Visitors sometimes arrive with accompanying minors. Capture the headcount by
-- age band alongside the visitor record so reception and security (and the
-- emergency muster) know exactly how many people are on site.
alter table public.visitors
  add column if not exists accompanying_infants     smallint not null default 0,
  add column if not exists accompanying_children     smallint not null default 0,
  add column if not exists accompanying_adolescents  smallint not null default 0;

alter table public.visitors drop constraint if exists visitors_accompanying_nonneg_chk;
alter table public.visitors add constraint visitors_accompanying_nonneg_chk check (
  accompanying_infants >= 0 and accompanying_infants <= 50
  and accompanying_children >= 0 and accompanying_children <= 50
  and accompanying_adolescents >= 0 and accompanying_adolescents <= 50
);

comment on column public.visitors.accompanying_infants is 'Accompanying infants (under ~2y) — counted for security/muster headcount.';
comment on column public.visitors.accompanying_children is 'Accompanying children — counted for security/muster headcount.';
comment on column public.visitors.accompanying_adolescents is 'Accompanying adolescents — counted for security/muster headcount.';
