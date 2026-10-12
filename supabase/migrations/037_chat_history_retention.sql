-- ============================================
-- 037_chat_history_retention.sql
-- "Last 10 chats per parent" chat history.
--
-- Parents keep only their most recent chats per school (see
-- lib/chat/history-retention.ts). Older chats are deleted, EXCEPT ones that
-- contain a flagged exchange (unanswered=true, or the owner's 'down'
-- feedback) — those stay readable by school staff (migration 031) but are
-- hidden from the parent's history via hidden_from_parent.
--
-- Additive and idempotent: one defaulted column plus a partial index for the
-- parent's visible-history query. No RLS, policy or grant changes.
-- ============================================

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS hidden_from_parent boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_school_visible
  ON public.chat_sessions(user_id, school_id, updated_at DESC)
  WHERE hidden_from_parent = false;
