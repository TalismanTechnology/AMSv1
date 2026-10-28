-- ============================================
-- 049_contact_folders.sql
-- Folders for the staff contact directory (044).
--
-- Admins group contacts into flat, school-level folders ("Admissions",
-- "Athletics", "Lower School Office", …) by hand or with the AI sort on the
-- admin Contacts page. Parents browse approved contacts grouped by these
-- folders on their Contacts page; a contact with no folder shows under
-- "Other".
--
-- Folder names are not sensitive, so every member of the school may read
-- them. Which CONTACTS a member sees is still decided by school_contacts' own
-- policies (044): members read approved rows only.
--
-- Deleting a folder never deletes contacts: their folder_id goes back to NULL
-- (unfiled).
--
-- MUST BE APPLIED MANUALLY (Supabase SQL editor / `supabase db push`).
-- Additive and idempotent. Safe to deploy the code first: while the table or
-- column is missing the admin Contacts page shows a "needs a database update"
-- notice and a flat grid, and the parent Contacts page lists everything under
-- one group.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.contact_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 60),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contact_folders IS
  'Folders grouping a school''s staff contacts (school_contacts.folder_id). Members read their school''s folders; admins manage them.';

-- One folder per name per school, ignoring case ("Athletics" = "athletics").
CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_folders_school_name
  ON public.contact_folders (school_id, lower(name));

ALTER TABLE public.school_contacts
  ADD COLUMN IF NOT EXISTS folder_id uuid
  REFERENCES public.contact_folders (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_school_contacts_folder
  ON public.school_contacts (folder_id)
  WHERE folder_id IS NOT NULL;

ALTER TABLE public.contact_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School admins can manage contact folders"
  ON public.contact_folders;
CREATE POLICY "School admins can manage contact folders"
  ON public.contact_folders FOR ALL
  TO authenticated
  USING (public.is_school_admin(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_admin(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "School members can read contact folders"
  ON public.contact_folders;
CREATE POLICY "School members can read contact folders"
  ON public.contact_folders FOR SELECT
  TO authenticated
  USING (public.is_school_member(school_id));

-- Supabase no longer grants new objects to the API roles implicitly.
REVOKE ALL ON public.contact_folders FROM PUBLIC;
REVOKE ALL ON public.contact_folders FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_folders TO authenticated;
GRANT ALL ON public.contact_folders TO service_role;

COMMIT;
