-- ============================================
-- 005_enhancements.sql
-- Chat feedback, notifications, audit log,
-- onboarding, document approval, recurring events,
-- announcement scheduling
-- ============================================

-- ============================================
-- CHAT FEEDBACK (thumbs up/down)
-- ============================================
CREATE TABLE public.chat_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('up', 'down')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(message_id, user_id)
);

ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own feedback"
  ON public.chat_feedback FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all feedback"
  ON public.chat_feedback FOR SELECT
  USING (public.is_admin());

CREATE INDEX idx_chat_feedback_message ON public.chat_feedback(message_id);

-- ============================================
-- NOTIFICATIONS (real-time bell)
-- ============================================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('announcement', 'approval', 'system')),
  title text NOT NULL,
  body text,
  read boolean DEFAULT false,
  link text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notifications"
  ON public.notifications FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (public.is_admin());

CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, read, created_at DESC);

-- Enable Supabase Realtime on notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============================================
-- AUDIT LOG
-- ============================================
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage audit log"
  ON public.audit_log FOR ALL
  USING (public.is_admin());

CREATE INDEX idx_audit_log_created ON public.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_entity ON public.audit_log(entity_type, entity_id);

-- ============================================
-- ONBOARDING FLAG
-- ============================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- ============================================
-- DOCUMENT APPROVAL (add 'pending' status)
-- ============================================
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_status_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_status_check
    CHECK (status IN ('processing', 'pending', 'ready', 'error'));

-- ============================================
-- RECURRING EVENTS
-- ============================================
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS recurrence text DEFAULT 'none'
    CHECK (recurrence IN ('none','daily','weekly','monthly','yearly'));

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS recurrence_end date;

-- ============================================
-- ANNOUNCEMENT SCHEDULING
-- ============================================
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'published'
    CHECK (status IN ('draft', 'scheduled', 'published'));

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS publish_at timestamptz;
