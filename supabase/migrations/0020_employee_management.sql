-- Employee management: department, lunch eligibility, worker type
do $$
begin
  if not exists (select 1 from pg_type where typname='employee_type') then
    create type public.employee_type as enum ('employee','contractor','guest');
  end if;
end$$;

alter table public.profiles
  add column if not exists department text,
  add column if not exists lunch_eligible boolean not null default true,
  add column if not exists employee_type public.employee_type not null default 'employee';

-- canteen_book now also enforces lunch eligibility + dish availability
-- (see migration 0020 body applied to DB; function redefined there).
