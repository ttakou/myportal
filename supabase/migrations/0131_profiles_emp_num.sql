-- Employee number: the person's id in the company HR/employee database. Unique
-- within a tenant (different tenants may reuse numbers), nullable so existing
-- profiles and pending accounts don't need one. A partial unique index allows
-- many NULLs while enforcing uniqueness on real values.

alter table public.profiles
  add column if not exists emp_num text;

create unique index if not exists profiles_emp_num_tenant_uniq
  on public.profiles (tenant_id, emp_num)
  where emp_num is not null;
