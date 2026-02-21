-- ============================================
-- 006_multi_tenancy.sql
-- Schools, memberships, school_id on all tables,
-- data migration to default school
-- ============================================

-- ============================================
-- SCHOOLS TABLE
-- ============================================
CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  contact_info text,
  domain text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_schools_slug ON public.schools(slug);

-- ============================================
-- EXPAND PROFILE ROLE TO INCLUDE super_admin
-- ============================================
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- The original table used an inline CHECK, try that name too
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check1;

-- Re-add with super_admin included
DO $$
BEGIN
  -- Drop any remaining check constraint on role
  PERFORM 1
  FROM information_schema.constraint_column_usage
  WHERE table_name = 'profiles' AND column_name = 'role';

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('admin', 'parent', 'super_admin'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================
-- SCHOOL_MEMBERSHIPS TABLE
-- (must be created before helper functions that reference it)
-- ============================================
CREATE TABLE public.school_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'parent' CHECK (role IN ('admin', 'parent')),
  approved boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, school_id)
);

ALTER TABLE public.school_memberships ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_school_memberships_user ON public.school_memberships(user_id);
CREATE INDEX idx_school_memberships_school ON public.school_memberships(school_id);
CREATE INDEX idx_school_memberships_school_role ON public.school_memberships(school_id, role);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Check if current user is a super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Check if current user is an admin of a given school
CREATE OR REPLACE FUNCTION public.is_school_admin(p_school_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE user_id = auth.uid()
      AND school_id = p_school_id
      AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Check if current user is a member of a given school
CREATE OR REPLACE FUNCTION public.is_school_member(p_school_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE user_id = auth.uid()
      AND school_id = p_school_id
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================
-- ADD school_id TO ALL EXISTING TABLES
-- (nullable first, then backfill, then NOT NULL)
-- ============================================

-- Categories
ALTER TABLE public.categories ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX idx_categories_school ON public.categories(school_id);

-- Documents
ALTER TABLE public.documents ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX idx_documents_school ON public.documents(school_id);

-- Document chunks
ALTER TABLE public.document_chunks ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX idx_document_chunks_school ON public.document_chunks(school_id);

-- Chat sessions
ALTER TABLE public.chat_sessions ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX idx_chat_sessions_school ON public.chat_sessions(school_id);

-- Chat messages
ALTER TABLE public.chat_messages ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX idx_chat_messages_school ON public.chat_messages(school_id);

-- Analytics events
ALTER TABLE public.analytics_events ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX idx_analytics_events_school ON public.analytics_events(school_id);

-- Folders
ALTER TABLE public.folders ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX idx_folders_school ON public.folders(school_id);

-- Events
ALTER TABLE public.events ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX idx_events_school ON public.events(school_id);

-- Children
ALTER TABLE public.children ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX idx_children_school ON public.children(school_id);

-- Announcements
ALTER TABLE public.announcements ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX idx_announcements_school ON public.announcements(school_id);

-- Announcement dismissals
ALTER TABLE public.announcement_dismissals ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

-- Chat feedback
ALTER TABLE public.chat_feedback ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

-- Notifications
ALTER TABLE public.notifications ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX idx_notifications_school ON public.notifications(school_id);

-- Audit log
ALTER TABLE public.audit_log ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX idx_audit_log_school ON public.audit_log(school_id);

-- Settings: add school_id column (will become PK after migration)
ALTER TABLE public.settings ADD COLUMN school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

-- ============================================
-- DATA MIGRATION: Create default school + backfill
-- ============================================

-- 1. Create the default school
INSERT INTO public.schools (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default School', 'default');

-- 2. Create school_memberships from existing profiles
INSERT INTO public.school_memberships (user_id, school_id, role, approved)
SELECT id, '00000000-0000-0000-0000-000000000001', role, approved
FROM public.profiles
WHERE role IN ('admin', 'parent')
ON CONFLICT DO NOTHING;

-- 3. Backfill school_id on all existing data
UPDATE public.categories SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;
UPDATE public.documents SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;
UPDATE public.document_chunks SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;
UPDATE public.chat_sessions SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;
UPDATE public.chat_messages SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;
UPDATE public.analytics_events SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;
UPDATE public.folders SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;
UPDATE public.events SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;
UPDATE public.children SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;
UPDATE public.announcements SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;
UPDATE public.announcement_dismissals SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;
UPDATE public.chat_feedback SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;
UPDATE public.notifications SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;
UPDATE public.audit_log SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;
UPDATE public.settings SET school_id = '00000000-0000-0000-0000-000000000001' WHERE school_id IS NULL;

-- ============================================
-- SETTINGS TABLE: re-key by school_id
-- ============================================
ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_id_check;
-- Drop the check constraint that enforces id = 1
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'settings'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.settings DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.settings DROP COLUMN id;
ALTER TABLE public.settings ADD PRIMARY KEY (school_id);

-- ============================================
-- MAKE school_id NOT NULL (after backfill)
-- ============================================
ALTER TABLE public.categories ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.documents ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.document_chunks ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.chat_sessions ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.chat_messages ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.analytics_events ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.folders ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.events ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.children ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.announcements ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.announcement_dismissals ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.chat_feedback ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.audit_log ALTER COLUMN school_id SET NOT NULL;

-- ============================================
-- UPDATE UNIQUE CONSTRAINTS TO BE SCHOOL-SCOPED
-- ============================================

-- Categories: unique(name) → unique(name, school_id)
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE public.categories ADD CONSTRAINT categories_name_school_unique UNIQUE(name, school_id);

-- Folders: unique(name, parent_id) → unique(name, parent_id, school_id)
ALTER TABLE public.folders DROP CONSTRAINT IF EXISTS folders_name_parent_id_key;
ALTER TABLE public.folders ADD CONSTRAINT folders_name_parent_school_unique UNIQUE(name, parent_id, school_id);

-- Folders root level: update partial unique index to be school-scoped
DROP INDEX IF EXISTS idx_folders_root_unique;
CREATE UNIQUE INDEX idx_folders_root_unique ON public.folders(name, school_id) WHERE parent_id IS NULL;
