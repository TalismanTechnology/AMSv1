-- ============================================
-- 004_elevation.sql
-- Children, Announcements, Settings, Indexes
-- ============================================

-- ============================================
-- CHILDREN TABLE (multi-child support)
-- ============================================
CREATE TABLE public.children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  grade text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

-- Parents manage their own children
CREATE POLICY "Users manage own children"
  ON public.children FOR ALL
  USING (auth.uid() = parent_id);

-- Admins can read all children
CREATE POLICY "Admins can read all children"
  ON public.children FOR SELECT
  USING (public.is_admin());

CREATE INDEX idx_children_parent ON public.children(parent_id);

-- Migrate existing child_grade data
INSERT INTO public.children (parent_id, name, grade)
SELECT id, 'Child', child_grade
FROM public.profiles
WHERE child_grade IS NOT NULL AND child_grade != '';

-- ============================================
-- ANNOUNCEMENTS TABLE
-- ============================================
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'important', 'urgent')),
  pinned boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage announcements"
  ON public.announcements FOR ALL
  USING (public.is_admin());

CREATE POLICY "Authenticated users can read active announcements"
  ON public.announcements FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (expires_at IS NULL OR expires_at > now())
  );

CREATE INDEX idx_announcements_pinned_created
  ON public.announcements(pinned DESC, created_at DESC);

CREATE INDEX idx_announcements_expires
  ON public.announcements(expires_at)
  WHERE expires_at IS NOT NULL;

-- ============================================
-- ANNOUNCEMENT DISMISSALS (banner dismiss tracking)
-- ============================================
CREATE TABLE public.announcement_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  dismissed_at timestamptz DEFAULT now(),
  UNIQUE(user_id, announcement_id)
);

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own dismissals"
  ON public.announcement_dismissals FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- SETTINGS TABLE (single row)
-- ============================================
CREATE TABLE public.settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  school_name text NOT NULL DEFAULT 'AskMySchool',
  logo_url text,
  contact_info text,
  custom_system_prompt text,
  ai_temperature numeric NOT NULL DEFAULT 0.7,
  suggested_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  welcome_message text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage settings"
  ON public.settings FOR ALL
  USING (public.is_admin());

CREATE POLICY "Authenticated users can read settings"
  ON public.settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Insert default row
INSERT INTO public.settings (id) VALUES (1);

-- ============================================
-- PERFORMANCE INDEXES
-- ============================================

-- Chat session lookup by user
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated
  ON public.chat_sessions(user_id, updated_at DESC);

-- Chat message lookup by session
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
  ON public.chat_messages(session_id, created_at ASC);

-- Analytics event lookup
CREATE INDEX IF NOT EXISTS idx_analytics_events_created
  ON public.analytics_events(created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created
  ON public.analytics_events(event_type, created_at);

-- ============================================
-- UPDATE handle_new_user() TRIGGER
-- Also insert child record when metadata present
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, approved, child_grade)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'role', 'parent'),
    true,
    new.raw_user_meta_data->>'child_grade'
  );

  -- Also insert into children table if child info is provided
  IF new.raw_user_meta_data->>'child_grade' IS NOT NULL
     AND new.raw_user_meta_data->>'child_grade' != '' THEN
    INSERT INTO public.children (parent_id, name, grade)
    VALUES (
      new.id,
      COALESCE(NULLIF(new.raw_user_meta_data->>'child_name', ''), 'Child'),
      new.raw_user_meta_data->>'child_grade'
    );
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
