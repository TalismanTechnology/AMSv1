-- ============================================
-- 044_school_contacts.sql
-- Staff contact directory used to route unanswered chat questions.
--
-- When the assistant can't answer from the school's documents, the chat
-- route picks the best APPROVED contact for the question's topic (and the
-- division, when known) and shows it as a contact card. Contact details only
-- ever come from these rows — never from model output.
--
-- Rows are added by school admins (source = 'admin') or suggested from the
-- school's own documents (source = 'document', status = 'suggested') and only
-- reach parents once an admin approves them. That is why this is its own
-- table and not a settings column: public.settings is readable by every
-- member, so unapproved suggestions can't live there.
--
-- "Contact routing enabled" = the school has at least one approved row.
-- Divisions are event_calendars rows with kind = 'division' (see 018 / 028).
--
-- MUST BE APPLIED MANUALLY (Supabase SQL editor / `supabase db push`).
-- Additive and idempotent. Safe to deploy the code first: while the table is
-- missing the chat behaves exactly as before and the admin Contacts tab shows
-- a "needs a database update" notice.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.school_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  email text,
  phone text,
  -- NULL = whole school.
  division_id uuid REFERENCES public.event_calendars (id) ON DELETE SET NULL,
  topics text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('approved', 'suggested', 'rejected')),
  source text NOT NULL DEFAULT 'admin'
    CHECK (source IN ('admin', 'document')),
  source_document_id uuid REFERENCES public.documents (id) ON DELETE SET NULL,
  -- The passage the suggestion was found in, shown to the admin reviewing it.
  source_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A contact nobody can reach is no use on a card.
  CHECK (coalesce(email, '') <> '' OR coalesce(phone, '') <> '')
);

COMMENT ON TABLE public.school_contacts IS
  'Staff contact directory for routing unanswered chat questions. Members read approved rows only; admins manage their school''s rows.';

-- The chat route's lookup: a school's approved contacts.
CREATE INDEX IF NOT EXISTS idx_school_contacts_school_status
  ON public.school_contacts (school_id, status);

CREATE INDEX IF NOT EXISTS idx_school_contacts_source_document
  ON public.school_contacts (source_document_id)
  WHERE source_document_id IS NOT NULL;

ALTER TABLE public.school_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School admins can manage school contacts"
  ON public.school_contacts;
CREATE POLICY "School admins can manage school contacts"
  ON public.school_contacts FOR ALL
  TO authenticated
  USING (public.is_school_admin(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_admin(school_id) OR public.is_super_admin());

-- Parents and other members only ever see approved contacts.
DROP POLICY IF EXISTS "School members can read approved school contacts"
  ON public.school_contacts;
CREATE POLICY "School members can read approved school contacts"
  ON public.school_contacts FOR SELECT
  TO authenticated
  USING (status = 'approved' AND public.is_school_member(school_id));

-- Supabase no longer grants new objects to the API roles implicitly.
REVOKE ALL ON public.school_contacts FROM PUBLIC;
REVOKE ALL ON public.school_contacts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_contacts TO authenticated;
GRANT ALL ON public.school_contacts TO service_role;

COMMIT;
