-- Capture a visitor's identity document at registration / check-in: a national
-- ID card (CNI), passport, or other, plus the document number. Optional — kept
-- as free text (type from a fixed UI list) so reception isn't blocked.

alter table public.visitors
  add column if not exists id_document_type   text,
  add column if not exists id_document_number text;
