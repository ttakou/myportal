-- =============================================================================
-- Allow transport task assignments on the notification delivery log.
-- =============================================================================

alter table public.eess_delivery_log
  drop constraint if exists eess_delivery_log_source_type_check;
alter table public.eess_delivery_log
  add constraint eess_delivery_log_source_type_check
  check (source_type in ('incident','broadcast','transport_task'));
