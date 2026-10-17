-- ============================================
-- 041_question_topics.sql
-- Cached topic label per parent question, for the admin Insights page's
-- "Top topics" list. Labels are produced by a daily cron (and on Insights
-- page load) via lib/insights/topics.ts. Additive / idempotent.
--
-- Privacy: this table holds ONLY a generic topic label ("Lunch Menu") keyed
-- by the analytics event — no question text and no user ids. The event row
-- (analytics_events) still holds those and stays service-role only (031).
-- School admins never read this table directly: the app authorizes them with
-- requireSchoolAdmin, reads with the service role, and returns k-anonymous
-- aggregates only (topics with < 3 questions or < 3 distinct askers hidden).
--
-- Supabase no longer auto-grants new objects in public to API roles, so the
-- grants below are explicit.
-- ============================================

CREATE TABLE IF NOT EXISTS public.question_topics (
  event_id   uuid PRIMARY KEY REFERENCES public.analytics_events(id) ON DELETE CASCADE,
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  topic      text NOT NULL,
  labeled_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.question_topics IS
  'Generic topic label per analytics question event (no question text, no user ids). Service role only; served to admins as k-anonymous aggregates.';

CREATE INDEX IF NOT EXISTS idx_question_topics_school_topic
  ON public.question_topics(school_id, topic);

-- RLS on with no policies: anon/authenticated can never read or write rows.
ALTER TABLE public.question_topics ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.question_topics FROM PUBLIC;
REVOKE ALL ON public.question_topics FROM anon, authenticated;
GRANT ALL ON public.question_topics TO service_role;
