-- Capture the staff member's vehicle at the gate. When a guard checks an
-- employee in, they can record the vehicle type and registration plate (both
-- optional), mirroring the visitor module (see 0089_visitor_vehicle_plate).
alter table public.staff_attendance
  add column if not exists vehicle_type  text,
  add column if not exists vehicle_plate text;
