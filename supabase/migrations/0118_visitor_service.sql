-- A visit can be assigned to a department/service (which team the visit is for),
-- in addition to the host individual (visitors.host_id). Reception can register
-- a walk-in directly and route it to the right service.
alter table public.visitors
  add column if not exists service text;

comment on column public.visitors.service is 'Department / service the visit is for (free of the host individual in host_id).';
