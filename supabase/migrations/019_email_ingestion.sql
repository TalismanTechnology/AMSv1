-- ============================================
-- 019_email_ingestion.sql
-- Inbound email -> documents ingestion + AI auto-sort config
-- ============================================

-- ── Per-school inbound email config ──────────────────
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS inbound_email_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS allowed_sender_domains text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS email_ingestion_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_sort_enabled boolean NOT NULL DEFAULT true;

-- Fast lookup of a school by its inbound address token (webhook hot path)
CREATE INDEX IF NOT EXISTS idx_schools_inbound_token
  ON public.schools(inbound_email_token)
  WHERE inbound_email_token IS NOT NULL;

-- ── Mark where a document came from ──────────────────
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'upload';

DO $$
BEGIN
  ALTER TABLE public.documents
    ADD CONSTRAINT documents_source_check
      CHECK (source IN ('upload', 'email'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ── Audit log of every inbound email attempt ─────────
CREATE TABLE IF NOT EXISTS public.email_ingestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  email_id text,
  message_id text,
  from_address text,
  subject text,
  status text NOT NULL CHECK (
    status IN ('accepted', 'rejected_disabled', 'rejected_domain', 'rejected_unknown', 'duplicate', 'error')
  ),
  reason text,
  document_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_ingestions ENABLE ROW LEVEL SECURITY;

-- Idempotency: one accepted record per provider message id per school.
-- Partial unique index so NULL message ids (rare) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_ingestions_message
  ON public.email_ingestions(school_id, message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_ingestions_school_date
  ON public.email_ingestions(school_id, created_at DESC);

CREATE POLICY "School admins can view email ingestions"
  ON public.email_ingestions FOR SELECT
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

-- Inserts happen from the service-role webhook (bypasses RLS); no INSERT policy needed.
