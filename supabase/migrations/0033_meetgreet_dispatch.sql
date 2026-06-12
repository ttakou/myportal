-- =============================================================================
-- Link a meet & greet to a dispatch task, so requesting airport assistance
-- creates a real "airport pickup" task on the transport dispatch board and the
-- traveller's briefing shows the live assigned driver/vehicle.
-- =============================================================================

alter table public.airport_assistance
  add column if not exists transport_request_id uuid
    references public.transport_requests(id) on delete set null;
