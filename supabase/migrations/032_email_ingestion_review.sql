-- ============================================
-- 032_email_ingestion_review.sql
-- Secure-by-default email intake: hold mail for admin review when a school
-- has no allowed sender domains.
--
-- PR #5 made the sender allowlist optional, so with an empty list anyone who
-- learned a school's inbound address could add documents parents read. Now
-- such mail is logged as 'pending_review' and nothing is ingested until a
-- school admin approves it (Admin → Settings → Email Ingestion → Recent
-- emails). Rejected mail is kept in the log as 'rejected_review'.
--
-- MUST BE APPLIED MANUALLY (Supabase SQL editor / `supabase db push`) before
-- or together with the deploy. Until it is applied, mail to schools with no
-- allowlist fails closed: the webhook can't write the held row, returns 500,
-- and nothing is ingested.
--
-- Numbered after 031_flagged_chat_access.sql (PR #8); apply after it.
-- ============================================

-- Divisions whose addresses a held message reached, so approval tags the
-- documents exactly as the webhook would have.
ALTER TABLE public.email_ingestions
  ADD COLUMN IF NOT EXISTS division_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.email_ingestions
  DROP CONSTRAINT IF EXISTS email_ingestions_status_check;

ALTER TABLE public.email_ingestions
  ADD CONSTRAINT email_ingestions_status_check CHECK (
    status IN (
      'processing',
      'accepted',
      'pending_review',
      'rejected_review',
      'rejected_disabled',
      'rejected_domain',
      'rejected_unknown',
      'duplicate',
      'error'
    )
  );

-- A held message occupies the same per-message slot as a claim, so a second
-- delivery of it (another division's copy, a retry) merges into the held row
-- instead of creating another, and approving it can't race a fresh delivery.
DROP INDEX IF EXISTS public.uniq_email_ingestions_claim;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_ingestions_claim
  ON public.email_ingestions(school_id, message_id)
  WHERE message_id IS NOT NULL
    AND status IN ('processing', 'accepted', 'pending_review');

-- Admins look up what is waiting for them.
CREATE INDEX IF NOT EXISTS idx_email_ingestions_pending
  ON public.email_ingestions(school_id, created_at DESC)
  WHERE status = 'pending_review';

-- Explicit grants (Supabase no longer grants new objects to the API roles
-- implicitly). Admins read the log through RLS ("School admins can view email
-- ingestions"); every write goes through the service role (webhook + the
-- approve/reject server actions), so authenticated gets SELECT only.
GRANT SELECT ON public.email_ingestions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_ingestions TO service_role;
