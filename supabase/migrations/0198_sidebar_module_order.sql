-- Sidebar order of the modules: Admin Center, Emergency, Canteen, Visitor,
-- Transportation (with Out of Town folded into it), Offshore, Performance,
-- Training, Savings, then Fitness.
update public.services_catalog s set sort_order = v.o
from (values
  ('core', 0),
  ('emergency', 1),
  ('canteen', 10),
  ('visitors', 20),
  ('transportation', 30),
  ('out-of-town', 35),
  ('offshore', 40),
  ('performance', 50),
  ('training', 60),
  ('savings', 70),
  ('medical', 80)
) as v(slug, o)
where s.slug = v.slug and s.sort_order <> v.o;
