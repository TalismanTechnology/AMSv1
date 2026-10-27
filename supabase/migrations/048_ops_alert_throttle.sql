-- ============================================
-- 048_ops_alert_throttle.sql
-- Throttle for owner (ops) alert emails, e.g. "the AI provider is failing"
-- (lib/alerts/ai-failure-alert.ts): at most one email per alert key per
-- window, across every serverless instance.
--
-- Until this is applied the code falls back to a per-instance in-memory
-- throttle, so it is safe to deploy the code first.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_alert_throttle (
  -- e.g. "ai_failure:billing_quota"
  key text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now()
);

-- Service role only: no policies, so no other role can read or write it.
ALTER TABLE public.ops_alert_throttle ENABLE ROW LEVEL SECURITY;

-- Atomically claim the right to send the alert for p_key: true when nothing
-- was sent for it within p_window_seconds (and records now as the send
-- time), false otherwise. Two instances racing for the same key can't both
-- get true.
CREATE OR REPLACE FUNCTION public.claim_ops_alert(p_key text, p_window_seconds integer)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH claimed AS (
    INSERT INTO public.ops_alert_throttle AS t (key, last_sent_at)
    VALUES (p_key, now())
    ON CONFLICT (key) DO UPDATE
      SET last_sent_at = now()
      WHERE t.last_sent_at <= now() - make_interval(secs => p_window_seconds)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;

REVOKE ALL ON FUNCTION public.claim_ops_alert(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ops_alert(text, integer) TO service_role;

COMMIT;
