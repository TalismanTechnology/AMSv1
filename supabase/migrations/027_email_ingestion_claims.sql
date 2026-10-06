-- ============================================
-- 027_email_ingestion_claims.sql
-- Make inbound-email idempotency hold under retries and concurrent delivery.
--
-- 019 put a unique index on (school_id, message_id) for every status. That
-- blocked the 'accepted' row a retry tries to write after an earlier attempt
-- was logged as 'error', so the insert failed silently and the next retry
-- ingested the same email again.
--
-- Now the webhook claims a message by inserting a 'processing' row before it
-- creates any documents, and flips that row to 'accepted' or 'error' when it
-- is done. Only 'processing' and 'accepted' rows are unique, so:
--   - a second delivery of the same email while the first is running, or
--     after it succeeded, conflicts and is skipped;
--   - a failed attempt ('error') frees the message for Resend's retry;
--   - rejected / error rows can repeat freely as a log.
-- ============================================

ALTER TABLE public.email_ingestions
  DROP CONSTRAINT IF EXISTS email_ingestions_status_check;

ALTER TABLE public.email_ingestions
  ADD CONSTRAINT email_ingestions_status_check CHECK (
    status IN (
      'processing',
      'accepted',
      'rejected_disabled',
      'rejected_domain',
      'rejected_unknown',
      'duplicate',
      'error'
    )
  );

DROP INDEX IF EXISTS public.uniq_email_ingestions_message;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_ingestions_claim
  ON public.email_ingestions(school_id, message_id)
  WHERE message_id IS NOT NULL AND status IN ('processing', 'accepted');
