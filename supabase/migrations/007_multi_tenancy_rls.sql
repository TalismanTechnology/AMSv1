-- ============================================
-- 007_multi_tenancy_rls.sql
-- Replace all RLS policies with school-scoped versions,
-- update match_document_chunks, update handle_new_user
-- ============================================

-- ============================================
-- SCHOOLS RLS
-- ============================================
-- Schools are public data (slugs appear in URLs, needed for login/register pages)
CREATE POLICY "Anyone can read schools"
  ON public.schools FOR SELECT
  USING (true);

CREATE POLICY "Super admins can manage schools"
  ON public.schools FOR ALL
  USING (public.is_super_admin());

-- ============================================
-- SCHOOL_MEMBERSHIPS RLS
-- ============================================
CREATE POLICY "Users can read own memberships"
  ON public.school_memberships FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "School admins can read school memberships"
  ON public.school_memberships FOR SELECT
  USING (public.is_school_admin(school_id));

CREATE POLICY "School admins can update school memberships"
  ON public.school_memberships FOR UPDATE
  USING (public.is_school_admin(school_id));

CREATE POLICY "School admins can delete school memberships"
  ON public.school_memberships FOR DELETE
  USING (public.is_school_admin(school_id));

CREATE POLICY "Users can insert own membership"
  ON public.school_memberships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super admins can manage all memberships"
  ON public.school_memberships FOR ALL
  USING (public.is_super_admin());

-- ============================================
-- PROFILES RLS (update existing)
-- ============================================
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Users can read own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- School admins can read profiles of members in their schools
CREATE POLICY "School admins can read school member profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships sm1
      JOIN public.school_memberships sm2 ON sm1.school_id = sm2.school_id
      WHERE sm1.user_id = auth.uid()
        AND sm1.role = 'admin'
        AND sm2.user_id = profiles.id
    )
  );

-- Super admins can read all profiles
CREATE POLICY "Super admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_super_admin());

-- Super admins can update any profile
CREATE POLICY "Super admins can update profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_super_admin());

-- Users can update own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Allow insert during registration
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- CATEGORIES RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Anyone authenticated can read categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;

CREATE POLICY "School members can read categories"
  ON public.categories FOR SELECT
  USING (public.is_school_member(school_id) OR public.is_super_admin());

CREATE POLICY "School admins can manage categories"
  ON public.categories FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

-- ============================================
-- DOCUMENTS RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Admins can manage documents" ON public.documents;
DROP POLICY IF EXISTS "Approved parents can read ready documents" ON public.documents;

CREATE POLICY "School admins can manage documents"
  ON public.documents FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

CREATE POLICY "School members can read ready documents"
  ON public.documents FOR SELECT
  USING (
    status = 'ready'
    AND (public.is_school_member(school_id) OR public.is_super_admin())
  );

-- ============================================
-- DOCUMENT_CHUNKS RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Admins can manage chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Approved parents can read chunks" ON public.document_chunks;

CREATE POLICY "School admins can manage chunks"
  ON public.document_chunks FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

CREATE POLICY "School members can read chunks"
  ON public.document_chunks FOR SELECT
  USING (public.is_school_member(school_id) OR public.is_super_admin());

-- ============================================
-- CHAT_SESSIONS RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Users manage own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Admins can read all chat sessions" ON public.chat_sessions;

CREATE POLICY "Users manage own school chat sessions"
  ON public.chat_sessions FOR ALL
  USING (auth.uid() = user_id AND public.is_school_member(school_id));

CREATE POLICY "School admins can read all school chat sessions"
  ON public.chat_sessions FOR SELECT
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

-- ============================================
-- CHAT_MESSAGES RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Users manage own messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Admins can read all messages" ON public.chat_messages;

CREATE POLICY "Users manage own school messages"
  ON public.chat_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions cs
      WHERE cs.id = chat_messages.session_id
        AND cs.user_id = auth.uid()
        AND cs.school_id = chat_messages.school_id
    )
  );

CREATE POLICY "School admins can read all school messages"
  ON public.chat_messages FOR SELECT
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

-- ============================================
-- ANALYTICS_EVENTS RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Users can insert own events" ON public.analytics_events;
DROP POLICY IF EXISTS "Admins can read all events" ON public.analytics_events;

CREATE POLICY "School members can insert analytics"
  ON public.analytics_events FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_school_member(school_id));

CREATE POLICY "School admins can read school analytics"
  ON public.analytics_events FOR SELECT
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

-- ============================================
-- FOLDERS RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Anyone authenticated can read folders" ON public.folders;
DROP POLICY IF EXISTS "Admins can manage folders" ON public.folders;

CREATE POLICY "School members can read folders"
  ON public.folders FOR SELECT
  USING (public.is_school_member(school_id) OR public.is_super_admin());

CREATE POLICY "School admins can manage folders"
  ON public.folders FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

-- ============================================
-- EVENTS RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Admins can manage events" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can read events" ON public.events;

CREATE POLICY "School admins can manage events"
  ON public.events FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

CREATE POLICY "School members can read events"
  ON public.events FOR SELECT
  USING (public.is_school_member(school_id) OR public.is_super_admin());

-- ============================================
-- CHILDREN RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Users manage own children" ON public.children;
DROP POLICY IF EXISTS "Admins can read all children" ON public.children;

CREATE POLICY "Users manage own school children"
  ON public.children FOR ALL
  USING (auth.uid() = parent_id AND public.is_school_member(school_id));

CREATE POLICY "School admins can read school children"
  ON public.children FOR SELECT
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

-- ============================================
-- ANNOUNCEMENTS RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "Authenticated users can read active announcements" ON public.announcements;

CREATE POLICY "School admins can manage announcements"
  ON public.announcements FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

CREATE POLICY "School members can read active announcements"
  ON public.announcements FOR SELECT
  USING (
    public.is_school_member(school_id)
    AND (expires_at IS NULL OR expires_at > now())
  );

-- ============================================
-- ANNOUNCEMENT_DISMISSALS RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Users manage own dismissals" ON public.announcement_dismissals;

CREATE POLICY "Users manage own school dismissals"
  ON public.announcement_dismissals FOR ALL
  USING (auth.uid() = user_id AND public.is_school_member(school_id));

-- ============================================
-- SETTINGS RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Admins can manage settings" ON public.settings;
DROP POLICY IF EXISTS "Authenticated users can read settings" ON public.settings;

CREATE POLICY "School admins can manage settings"
  ON public.settings FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

CREATE POLICY "School members can read settings"
  ON public.settings FOR SELECT
  USING (public.is_school_member(school_id) OR public.is_super_admin());

-- ============================================
-- CHAT_FEEDBACK RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Users manage own feedback" ON public.chat_feedback;
DROP POLICY IF EXISTS "Admins can read all feedback" ON public.chat_feedback;

CREATE POLICY "Users manage own school feedback"
  ON public.chat_feedback FOR ALL
  USING (auth.uid() = user_id AND public.is_school_member(school_id));

CREATE POLICY "School admins can read school feedback"
  ON public.chat_feedback FOR SELECT
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

-- ============================================
-- NOTIFICATIONS RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Users manage own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins can insert notifications" ON public.notifications;

CREATE POLICY "Users manage own school notifications"
  ON public.notifications FOR ALL
  USING (auth.uid() = user_id AND public.is_school_member(school_id));

CREATE POLICY "School admins can insert school notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (public.is_school_admin(school_id) OR public.is_super_admin());

-- ============================================
-- AUDIT_LOG RLS (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Admins can manage audit log" ON public.audit_log;

CREATE POLICY "School admins can read school audit log"
  ON public.audit_log FOR SELECT
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

-- Audit log inserts are done via admin client (service role), so no INSERT policy needed

-- ============================================
-- STORAGE POLICIES (replace existing)
-- ============================================
DROP POLICY IF EXISTS "Admins can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read stored documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete stored documents" ON storage.objects;

-- School admins can upload documents (bucket-level check; school path enforced in app)
CREATE POLICY "School admins can upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.school_memberships
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  );

-- School admins can read stored documents
CREATE POLICY "School admins can read stored documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.school_memberships
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  );

-- School admins can delete stored documents
CREATE POLICY "School admins can delete stored documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.school_memberships
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  );

-- ============================================
-- UPDATE match_document_chunks() WITH school_id
-- ============================================
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(768),
  p_school_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  JOIN public.documents d ON dc.document_id = d.id
  WHERE d.status = 'ready'
    AND dc.school_id = p_school_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================
-- UPDATE handle_new_user() TRIGGER
-- Profile creation only; membership created by app
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

  -- Children record created by app after school context is known
  -- (school_id is required on children table)

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
