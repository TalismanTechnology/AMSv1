-- ============================================
-- 031_flagged_chat_access.sql
-- School staff may read a parent's chat ONLY when it is flagged:
--   (a) 'unanswered' – the assistant found no school sources for the
--       question (the same signal that feeds unanswered_questions), or
--   (b) 'unhelpful'  – the parent gave the answer a thumbs-down
--       (chat_feedback.rating = 'down', left by the chat's owner).
-- Staff see only the flagged exchange (the question + the assistant's
-- reply), never the rest of the conversation. Parents keep full access to
-- their own chats. Aggregate analytics are served by the app's server code
-- (service role) after it checks the caller is a school admin, so
-- analytics_events (which stores question text) is no longer directly
-- readable by school admins either.
--
-- Supabase (Oct 30 platform change) no longer auto-grants new objects in public
-- to API roles, so every new view/function below has explicit grants.
-- ============================================

-- --------------------------------------------
-- 1. Flag signal on messages
-- --------------------------------------------
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS unanswered boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.chat_messages.unanswered IS
  'True when the assistant found no school sources for this exchange (set on both the user question and the assistant reply). Makes the exchange visible to school staff.';

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
  ON public.chat_messages(session_id, created_at);

-- Backfill from the existing unanswered-question log: mark the matching user
-- message and the assistant reply that followed it.
WITH q AS (
  SELECT DISTINCT ON (uq.id) m.id AS user_msg_id, m.session_id, m.created_at
  FROM public.unanswered_questions uq
  JOIN public.chat_messages m
    ON m.session_id = uq.session_id
   AND m.role = 'user'
   AND m.content = uq.question
  WHERE uq.session_id IS NOT NULL
  ORDER BY uq.id, abs(extract(epoch FROM (m.created_at - uq.created_at)))
),
pairs AS (
  SELECT q.user_msg_id AS id FROM q
  UNION
  SELECT (
    SELECT a.id FROM public.chat_messages a
    WHERE a.session_id = q.session_id
      AND a.role = 'assistant'
      AND a.created_at >= q.created_at
    ORDER BY a.created_at
    LIMIT 1
  ) FROM q
)
UPDATE public.chat_messages cm
SET unanswered = true
FROM pairs
WHERE cm.id = pairs.id;

-- --------------------------------------------
-- 2. Derived flag: why (if at all) a message is visible to staff
-- --------------------------------------------
-- SECURITY DEFINER so the lookups (neighbouring message, owner's feedback)
-- are not themselves filtered by the RLS policy that calls this function.
-- Only feedback left by the session's owner counts, so staff cannot
-- "unlock" a chat by thumbs-downing it themselves.
CREATE OR REPLACE FUNCTION public.chat_message_flag_reason(p_message_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m      public.chat_messages%ROWTYPE;
  owner  uuid;
  pair   public.chat_messages%ROWTYPE;  -- the other half of the exchange
BEGIN
  SELECT * INTO m FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT user_id INTO owner FROM public.chat_sessions WHERE id = m.session_id;

  IF m.role = 'user' THEN
    -- the assistant reply that answered this question
    SELECT * INTO pair FROM public.chat_messages
    WHERE session_id = m.session_id AND role = 'assistant'
      AND created_at >= m.created_at
    ORDER BY created_at
    LIMIT 1;
  ELSE
    -- the question this reply answered
    SELECT * INTO pair FROM public.chat_messages
    WHERE session_id = m.session_id AND role = 'user'
      AND created_at <= m.created_at
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF m.unanswered OR coalesce(pair.unanswered, false) THEN
    RETURN 'unanswered';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.chat_feedback f
    WHERE f.rating = 'down'
      AND f.user_id = owner
      AND f.message_id = CASE WHEN m.role = 'assistant' THEN m.id ELSE pair.id END
  ) THEN
    RETURN 'unhelpful';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_message_flag_reason(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chat_message_flag_reason(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.chat_message_flag_reason(uuid) TO authenticated, service_role;

-- --------------------------------------------
-- 3. RLS: chat_messages – staff read flagged exchanges only
-- --------------------------------------------
DROP POLICY IF EXISTS "School admins can read all school messages" ON public.chat_messages;
DROP POLICY IF EXISTS "School admins can read flagged school messages" ON public.chat_messages;

CREATE POLICY "School admins can read flagged school messages"
  ON public.chat_messages FOR SELECT
  USING (
    (public.is_school_admin(school_id) OR public.is_super_admin())
    AND public.chat_message_flag_reason(id) IS NOT NULL
  );

-- --------------------------------------------
-- 4. RLS: chat_sessions – staff no longer read sessions at all
--    (the session title is the parent's first question, which may not be
--    part of any flagged exchange). Staff identify a flagged chat by
--    session_id via flagged_chat_messages instead.
-- --------------------------------------------
DROP POLICY IF EXISTS "School admins can read all school chat sessions" ON public.chat_sessions;

-- --------------------------------------------
-- 5. RLS: chat_feedback – a parent can only rate messages in their own chats
--    (previously any school member could insert feedback on any message id).
--    Staff keep read access to ratings (no content) for the totals.
-- --------------------------------------------
DROP POLICY IF EXISTS "Users manage own school feedback" ON public.chat_feedback;

CREATE POLICY "Users manage own school feedback"
  ON public.chat_feedback FOR ALL
  USING (auth.uid() = user_id AND public.is_school_member(school_id))
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_school_member(school_id)
    AND EXISTS (
      SELECT 1
      FROM public.chat_messages cm
      JOIN public.chat_sessions cs ON cs.id = cm.session_id
      WHERE cm.id = chat_feedback.message_id
        AND cs.user_id = auth.uid()
        AND cm.school_id = chat_feedback.school_id
    )
  );

-- --------------------------------------------
-- 6. RLS: analytics_events – stores raw question text + user_id, so school
--    admins lose direct row access. The admin dashboard/analytics pages read
--    it server-side (service role) and expose only aggregates.
-- --------------------------------------------
DROP POLICY IF EXISTS "School admins can read school analytics" ON public.analytics_events;

-- --------------------------------------------
-- 7. Convenience view of flagged messages
--    security_invoker => the caller's RLS on chat_messages applies, so
--    parents see their own flagged messages and staff see their school's.
-- --------------------------------------------
DROP VIEW IF EXISTS public.flagged_chat_messages;

CREATE VIEW public.flagged_chat_messages
WITH (security_invoker = true) AS
SELECT
  m.id,
  m.session_id,
  m.school_id,
  m.role,
  m.content,
  m.sources,
  m.created_at,
  public.chat_message_flag_reason(m.id) AS flag_reason
FROM public.chat_messages m
WHERE public.chat_message_flag_reason(m.id) IS NOT NULL;

REVOKE ALL ON public.flagged_chat_messages FROM PUBLIC;
REVOKE ALL ON public.flagged_chat_messages FROM anon;
GRANT SELECT ON public.flagged_chat_messages TO authenticated, service_role;
