-- ============================================
-- 051_intake_address_visibility.sql
-- Mailing-list intake addresses, and documents only some parents can see.
--
-- A school can now add its own inbound addresses, one per mailing list
-- ("Middle School parents", "Grade 9"), next to the whole-school and
-- division addresses it already has. Each address can be switched off, can
-- accept only some senders, can file into a default folder, and can limit
-- who sees what it receives to parents with a child in certain grades.
-- Documents carry that limit in documents.visible_grades.
--
-- MUST BE APPLIED MANUALLY (Supabase SQL editor / `supabase db push`)
-- BEFORE the code that uses it deploys. Additive and safe for the code that
-- is running now:
--   - every new column is nullable or has a default that means "as before"
--     (existing addresses: enabled, all parents, any sender, no folder;
--     existing documents: visible_grades NULL = all parents);
--   - match_document_chunks (both overloads) and search_document_chunks keep
--     working for the running code (only anon loses EXECUTE, which nothing
--     uses); the new code calls new *_v2 functions, which work out the
--     viewer's grades in SQL;
--   - the two parent SELECT policies are replaced in this transaction with
--     ones that also check grades. With every document NULL, they return
--     the same rows as before.
--   - the whole-school unique index is rebuilt to ignore list addresses; it
--     still keeps one whole-school address per school.
-- ============================================

-- ── 1. Intake addresses ──────────────────────────────
-- kind: 'school' = the whole-school address (division_id NULL), 'division'
-- = a division's address, 'list' = an address an admin added for a mailing
-- list (division_id NULL). school/division are the system addresses, which
-- can be edited and switched off but not deleted.
ALTER TABLE public.email_ingestion_addresses
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'school',
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  -- NULL (or empty) = all parents. Otherwise only parents with a current
  -- (not graduated) child in this school in one of these grades.
  ADD COLUMN IF NOT EXISTS visible_grades text[],
  -- NULL (or empty) = any sender, as today (there is no school allowlist).
  -- Otherwise only these senders: full addresses ("office@school.org") or
  -- domains ("school.org", which also covers its subdomains).
  ADD COLUMN IF NOT EXISTS allowed_senders text[],
  ADD COLUMN IF NOT EXISTS default_folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.email_ingestion_addresses
SET kind = 'division'
WHERE division_id IS NOT NULL AND kind <> 'division';

DO $$
BEGIN
  ALTER TABLE public.email_ingestion_addresses
    ADD CONSTRAINT email_ingestion_addresses_kind_check CHECK (
      (kind = 'division' AND division_id IS NOT NULL)
      OR (kind IN ('school', 'list') AND division_id IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.email_ingestion_addresses
    ADD CONSTRAINT email_ingestion_addresses_visible_grades_check CHECK (
      visible_grades IS NULL
      OR visible_grades <@ ARRAY['Pre-K','K','1','2','3','4','5','6','7','8','9','10','11','12']::text[]
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.email_ingestion_addresses
    ADD CONSTRAINT email_ingestion_addresses_label_check CHECK (
      label IS NULL OR char_length(label) <= 80
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Was "one row per school with division_id NULL", which list addresses
-- (also division_id NULL) would break. Same guarantee, whole-school only.
DROP INDEX IF EXISTS public.uniq_email_ingestion_addresses_whole_school;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_ingestion_addresses_whole_school
  ON public.email_ingestion_addresses(school_id)
  WHERE division_id IS NULL AND kind = 'school';

-- A default folder must be one of the address's own school's folders.
DROP POLICY IF EXISTS "School admins can manage email ingestion addresses"
  ON public.email_ingestion_addresses;
CREATE POLICY "School admins can manage email ingestion addresses"
  ON public.email_ingestion_addresses FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin())
  WITH CHECK (
    (public.is_school_admin(school_id) OR public.is_super_admin())
    AND (
      division_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.event_calendars c
        WHERE c.id = email_ingestion_addresses.division_id
          AND c.school_id = email_ingestion_addresses.school_id
          AND c.kind = 'division'
      )
    )
    AND (
      default_folder_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.folders f
        WHERE f.id = email_ingestion_addresses.default_folder_id
          AND f.school_id = email_ingestion_addresses.school_id
      )
    )
  );

-- ── 2. Documents: who may see them ───────────────────
-- NULL (or empty) = all parents. Existing documents stay NULL.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS visible_grades text[];

DO $$
BEGIN
  ALTER TABLE public.documents
    ADD CONSTRAINT documents_visible_grades_check CHECK (
      visible_grades IS NULL
      OR visible_grades <@ ARRAY['Pre-K','K','1','2','3','4','5','6','7','8','9','10','11','12']::text[]
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- The admin library filters on it; partial because almost every document is
-- for all parents.
CREATE INDEX IF NOT EXISTS idx_documents_visible_grades
  ON public.documents USING GIN (visible_grades)
  WHERE visible_grades IS NOT NULL;

-- ── 3. The visibility rule (for RLS) ─────────────────
-- Mirrors lib/documents/grade-visibility.ts: a document with no grades is
-- for everyone; otherwise the school's admins and super-admins see it, and a
-- parent sees it when one of their current (not graduated) children in that
-- school is in one of its grades. A parent with no children on file sees
-- only documents for all parents. SECURITY DEFINER so it can read children
-- without depending on that table's policies; it only ever looks at the
-- caller's own children.
CREATE OR REPLACE FUNCTION public.can_view_document_grades(
  p_school_id uuid,
  p_visible_grades text[]
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN p_visible_grades IS NULL OR cardinality(p_visible_grades) = 0 THEN true
    WHEN public.is_super_admin() OR public.is_school_admin(p_school_id) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.parent_id = (SELECT auth.uid())
        AND c.school_id = p_school_id
        AND c.graduated_at IS NULL
        AND c.grade = ANY (p_visible_grades)
    )
  END;
$$;

-- The same rule for a chunk, by its document.
CREATE OR REPLACE FUNCTION public.can_view_document_chunk(p_document_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    (
      SELECT public.can_view_document_grades(d.school_id, d.visible_grades)
      FROM public.documents d
      WHERE d.id = p_document_id
    ),
    false
  );
$$;

-- RLS policies call these as the requesting role (like is_*()), anon
-- included: a policy referencing a function the role can't execute fails
-- the whole query instead of returning no rows. They reveal nothing (only
-- true/false about the caller's own children).
REVOKE EXECUTE ON FUNCTION public.can_view_document_grades(uuid, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_document_chunk(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_document_grades(uuid, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_document_chunk(uuid) TO anon, authenticated, service_role;

-- ── 4. Parent read policies ──────────────────────────
-- Admins keep full access through "School admins can manage documents" /
-- "School admins can manage chunks" (007), which are unchanged.
DROP POLICY IF EXISTS "School members can read ready documents" ON public.documents;
CREATE POLICY "School members can read ready documents"
  ON public.documents FOR SELECT
  USING (
    status = 'ready'
    AND (
      public.is_super_admin()
      OR (
        public.is_school_member(school_id)
        AND public.can_view_document_grades(school_id, visible_grades)
      )
    )
  );

DROP POLICY IF EXISTS "School members can read chunks" ON public.document_chunks;
CREATE POLICY "School members can read chunks"
  ON public.document_chunks FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.is_school_member(school_id)
      AND public.can_view_document_chunk(document_id)
    )
  );

-- ── 5. Retrieval scoped to a viewer ─────────────────
-- New functions rather than new overloads: match_document_chunks already
-- has two, and the deployed code keeps calling the old ones until the new
-- code is live (see 052 for retiring them).
--
-- The caller names the viewer, never their grades: the database works out
-- what that user may see from school_memberships, profiles and children.
-- When called with a user's own session, auth.uid() is the viewer whatever
-- p_viewer says, so a browser can't borrow another user's view. The chat
-- calls with the service role (auth.uid() NULL) and passes the signed-in
-- user's id. No viewer, or a viewer who isn't an approved member (or admin)
-- of the school, gets nothing.
--
-- document_view_scope: may this viewer read this school's library at all,
-- do they see everything (school admin or super-admin), and otherwise the
-- grades of their current (not graduated) children there. A parent with no
-- children on file gets an empty list: documents for all parents only.
CREATE OR REPLACE FUNCTION public.document_view_scope(p_viewer uuid, p_school_id uuid)
RETURNS TABLE (allowed boolean, see_all boolean, grades text[])
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH v AS (
    SELECT COALESCE((SELECT auth.uid()), p_viewer) AS uid
  ),
  r AS (
    SELECT
      v.uid,
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v.uid AND p.role = 'super_admin'
      ) AS is_super,
      EXISTS (
        SELECT 1 FROM public.school_memberships m
        WHERE m.user_id = v.uid AND m.school_id = p_school_id AND m.role = 'admin'
      ) AS is_admin,
      EXISTS (
        SELECT 1 FROM public.school_memberships m
        WHERE m.user_id = v.uid AND m.school_id = p_school_id AND m.approved
      ) AS is_member
    FROM v
  )
  SELECT
    r.uid IS NOT NULL AND (r.is_super OR r.is_admin OR r.is_member) AS allowed,
    r.uid IS NOT NULL AND (r.is_super OR r.is_admin) AS see_all,
    COALESCE(
      (
        SELECT array_agg(DISTINCT c.grade)
        FROM public.children c
        WHERE c.parent_id = r.uid
          AND c.school_id = p_school_id
          AND c.graduated_at IS NULL
          AND c.grade IS NOT NULL
      ),
      '{}'::text[]
    ) AS grades
  FROM r;
$$;

-- Only the retrieval functions (and the server) need it.
REVOKE EXECUTE ON FUNCTION public.document_view_scope(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_view_scope(uuid, uuid) TO authenticated, service_role;

-- The grade check is inside the query, before ORDER BY / LIMIT, so a
-- restricted chunk never takes a slot. SECURITY INVOKER like the originals,
-- so a signed-in caller is also held to the policies above.
CREATE OR REPLACE FUNCTION public.match_document_chunks_v2(
  query_embedding extensions.vector(768),
  p_school_id uuid,
  p_viewer uuid,
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  chunk_index integer,
  metadata jsonb,
  similarity double precision
)
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  WITH s AS (
    SELECT * FROM public.document_view_scope(p_viewer, p_school_id)
  )
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM s, public.document_chunks dc
  JOIN public.documents d ON dc.document_id = d.id
  WHERE s.allowed
    AND d.status = 'ready'
    AND dc.school_id = p_school_id
    AND (
      s.see_all
      OR d.visible_grades IS NULL
      OR cardinality(d.visible_grades) = 0
      OR d.visible_grades && s.grades
    )
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.search_document_chunks_v2(
  p_school_id uuid,
  p_query text,
  p_viewer uuid,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  document_id uuid,
  document_title text,
  content text,
  chunk_index integer,
  rank real
)
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  WITH s AS (
    SELECT * FROM public.document_view_scope(p_viewer, p_school_id)
  )
  SELECT
    dc.document_id,
    d.title AS document_title,
    dc.content,
    dc.chunk_index,
    ts_rank(dc.content_tsv, websearch_to_tsquery('english', p_query)) AS rank
  FROM s, public.document_chunks dc
  JOIN public.documents d ON d.id = dc.document_id
  WHERE s.allowed
    AND dc.school_id = p_school_id
    AND d.status = 'ready'
    AND (
      s.see_all
      OR d.visible_grades IS NULL
      OR cardinality(d.visible_grades) = 0
      OR d.visible_grades && s.grades
    )
    AND dc.content_tsv @@ websearch_to_tsquery('english', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION public.match_document_chunks_v2(extensions.vector, uuid, uuid, double precision, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_document_chunks_v2(uuid, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_document_chunks_v2(extensions.vector, uuid, uuid, double precision, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_document_chunks_v2(uuid, text, uuid, integer) TO authenticated, service_role;

-- ── 6. The old, unscoped functions ───────────────────
-- Nothing anonymous ever called them. Signed-in callers still may until the
-- new code is live (the current deploy's content search calls
-- search_document_chunks with the user's session); those calls already go
-- through the policies above (SECURITY INVOKER), so they can't return a
-- restricted chunk either. 052 takes them away from every API role once the
-- new code is deployed.
REVOKE EXECUTE ON FUNCTION public.search_document_chunks(uuid, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.match_document_chunks(extensions.vector, double precision, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.match_document_chunks(extensions.vector, uuid, double precision, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_document_chunks(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(extensions.vector, double precision, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(extensions.vector, uuid, double precision, integer) TO authenticated, service_role;

-- Make the new functions visible to PostgREST right away.
NOTIFY pgrst, 'reload schema';
