-- ============================================
-- 014_unanswered_questions.sql
-- Track questions where the chatbot found no sources,
-- with embeddings for AI-powered similarity grouping.
-- ============================================

CREATE TABLE public.unanswered_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  question text NOT NULL,
  embedding vector(768),
  session_id uuid REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.unanswered_questions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_unanswered_questions_school ON public.unanswered_questions(school_id);
CREATE INDEX idx_unanswered_questions_created ON public.unanswered_questions(created_at);

-- School admins and super admins can read
CREATE POLICY "School admins can read unanswered questions"
  ON public.unanswered_questions FOR SELECT
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

-- School admins and super admins can delete (dismiss resolved questions)
CREATE POLICY "School admins can delete unanswered questions"
  ON public.unanswered_questions FOR DELETE
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

-- Inserts happen via adminSupabase (service role), no user INSERT policy needed
