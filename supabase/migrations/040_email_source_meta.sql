-- 040: Email source metadata for the citation viewer.
--
-- Emailed documents only store the plain-text body, so the source viewer had
-- no sender, recipients or original HTML to show. Inbound email ingest now
-- records them here. Additive only; existing RLS on documents covers it.

alter table public.documents add column if not exists email_meta jsonb;

comment on column public.documents.email_meta is
  'Inbound email headers for documents created from an email body: {from, to, cc, reply_to, date, subject, html_path}. html_path is a storage key in the documents bucket for the original HTML body, or null.';
