-- ============================================
-- 042_new_document_push.sql
-- Push notifications to parents when their school adds new documents.
--
-- 1. document_push_queue: one row per uploaded / emailed document that became
--    ready for parents (lib/push/document-push-runner.ts). The
--    send-document-pushes cron sends each school's pending rows as one push
--    and records the outcome. Rows are kept after sending: the primary key is
--    what stops a re-processed document being queued again. Service role only.
-- 2. settings.new_document_push_enabled: a school can turn these pushes off
--    (Admin > Settings > General). Missing settings row = on.
-- 3. notification_preferences: a parent can turn them off for themselves
--    (Profile > Notifications). Missing row = on.
--
-- MUST BE APPLIED MANUALLY (Supabase SQL editor / `supabase db push`).
-- Additive and idempotent. Safe to deploy the code first: queueing is
-- best-effort and logs while the table is missing, the cron reports the error,
-- and the profile toggle shows its default.
-- ============================================

BEGIN;

-- ── 1. Queue ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_push_queue (
  document_id uuid PRIMARY KEY REFERENCES public.documents (id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  queued_at timestamptz NOT NULL DEFAULT now(),
  -- Set when a cron run claims or skips the row; null = waiting.
  processed_at timestamptz,
  outcome text CHECK (
    outcome IN (
      'sent',
      'skipped_disabled',
      'skipped_not_ready',
      'skipped_not_configured',
      'skipped_no_recipients',
      'failed'
    )
  )
);

-- The cron's "what is waiting, per school" scan.
CREATE INDEX IF NOT EXISTS document_push_queue_pending_idx
  ON public.document_push_queue (school_id, queued_at)
  WHERE processed_at IS NULL;

-- "When did this school last get a push" (the 3-hour limit).
CREATE INDEX IF NOT EXISTS document_push_queue_last_sent_idx
  ON public.document_push_queue (school_id, processed_at DESC)
  WHERE outcome = 'sent';

ALTER TABLE public.document_push_queue ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role reads or writes the queue.

-- ── 2. School switch ──────────────────────────────────────────────
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS new_document_push_enabled boolean NOT NULL DEFAULT true;

-- ── 3. Parent switch ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  new_document_push boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own notification preferences"
  ON public.notification_preferences;
CREATE POLICY "Users can read their own notification preferences"
  ON public.notification_preferences FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own notification preferences"
  ON public.notification_preferences;
CREATE POLICY "Users can create their own notification preferences"
  ON public.notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own notification preferences"
  ON public.notification_preferences;
CREATE POLICY "Users can update their own notification preferences"
  ON public.notification_preferences FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── 4. Explicit grants ────────────────────────────────────────────
-- Supabase no longer grants new objects to the API roles implicitly.
REVOKE ALL ON public.document_push_queue FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_push_queue TO service_role;

REVOKE ALL ON public.notification_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO service_role;

COMMIT;
