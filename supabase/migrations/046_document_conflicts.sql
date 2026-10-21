-- ============================================
-- 046_document_conflicts.sql
-- Discrepancies between a school's documents, and the admin's ruling on them.
--
-- A scan (lib/conflicts/scan.ts) pairs up chunks from DIFFERENT documents
-- whose embeddings are near-identical in meaning (find_conflict_candidates),
-- asks Gemini whether each pair genuinely disagrees, and records every pair it
-- judged here — conflicts as 'open', everything else as 'auto_dismissed' — so
-- no pair is ever paid for twice. Admins then pick which document is right,
-- write the correct answer, or dismiss it (Admin > Conflicts).
--
-- Only RESOLVED rows affect parent answers: the losing chunk is left out of
-- the chat context and the ruling (and any admin note) is added as a "School
-- clarification". Documents and their chunks are never modified; conflicts
-- only add rows here.
--
-- Rulings outlive re-processing. A website re-sync or re-upload replaces a
-- document's chunks: the row's chunk ids become NULL (ON DELETE SET NULL),
-- but it keeps both statements and an excerpt of each chunk as judged, so the
-- admin page still shows it, chat still applies it (matching the statement in
-- the document's new chunks), and the next scan doesn't ask again about a
-- conflict already in this table. Deleting a document deletes its rows.
--
-- conflict_scan_runs records each scan so the admin page can show "last
-- scanned" and the daily cron (/api/cron/scan-conflicts) knows which
-- documents were processed since the school's previous scan.
--
-- MUST BE APPLIED MANUALLY (Supabase SQL editor / `supabase db push`).
-- Additive and idempotent. Safe to deploy the code first: while these objects
-- are missing, chat answers exactly as before, the cron returns ok with a
-- "not installed" note, and Admin > Conflicts shows a "needs a database
-- update" notice. See docs/CONFLICTS.md.
-- ============================================

BEGIN;

-- ── 1. document_conflicts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  -- NULL once the chunk is gone (its document was re-processed).
  chunk_a_id uuid,
  chunk_b_id uuid,
  document_a_id uuid NOT NULL,
  document_b_id uuid NOT NULL,
  -- Where each side sat in its document when judged, for citations and the
  -- viewer. Kept after re-processing (they may then point elsewhere).
  chunk_a_index integer NOT NULL,
  chunk_b_index integer NOT NULL,
  chunk_a_page integer,
  chunk_b_page integer,
  -- The unordered chunk pair: one row per pair, whichever side is "A".
  -- NULL once either chunk is gone (unique only while both exist, below).
  pair_key text GENERATED ALWAYS AS (
    least(chunk_a_id, chunk_b_id)::text || ':' || greatest(chunk_a_id, chunk_b_id)::text
  ) STORED,
  similarity double precision NOT NULL,
  -- Filled from the model's judgment; may be empty on auto-dismissed rows.
  topic text,
  description text,
  statement_a text,
  statement_b text,
  -- Each side's chunk text (around the statement) as judged, for the admin
  -- page once the chunk itself is gone.
  excerpt_a text,
  excerpt_b text,
  confidence double precision CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'dismissed', 'auto_dismissed')),
  resolution text
    CHECK (resolution IN ('a_correct', 'b_correct', 'custom')),
  admin_note text,
  resolved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_conflicts_chunk_a_id_fkey
    FOREIGN KEY (chunk_a_id) REFERENCES public.document_chunks (id) ON DELETE SET NULL,
  CONSTRAINT document_conflicts_chunk_b_id_fkey
    FOREIGN KEY (chunk_b_id) REFERENCES public.document_chunks (id) ON DELETE SET NULL,
  CONSTRAINT document_conflicts_document_a_id_fkey
    FOREIGN KEY (document_a_id) REFERENCES public.documents (id) ON DELETE CASCADE,
  CONSTRAINT document_conflicts_document_b_id_fkey
    FOREIGN KEY (document_b_id) REFERENCES public.documents (id) ON DELETE CASCADE,
  -- NULL (a chunk gone) passes, as CHECK constraints do.
  CHECK (chunk_a_id <> chunk_b_id),
  CHECK (document_a_id <> document_b_id),
  -- A resolution exists exactly when the conflict is resolved, and writing
  -- the correct answer means writing something.
  CHECK ((status = 'resolved') = (resolution IS NOT NULL)),
  CHECK (resolution IS DISTINCT FROM 'custom' OR coalesce(btrim(admin_note), '') <> '')
);

COMMENT ON TABLE public.document_conflicts IS
  'Pairs of document chunks judged for conflicting facts. open = needs an admin; resolved = admin ruled (resolution); dismissed = admin said not a conflict; auto_dismissed = the model said not a conflict. Chunk ids become NULL when a document is re-processed; statements and excerpts keep the row meaningful. Written by scans (service role); admins read and update their school''s rows.';

-- One row per live chunk pair. Partial: rows whose chunks are gone (pair_key
-- NULL) no longer name a pair. Scans check pair_key first and insert plainly
-- (lib/conflicts/scan.ts); this catches a concurrent scan.
CREATE UNIQUE INDEX IF NOT EXISTS document_conflicts_pair_unique
  ON public.document_conflicts (school_id, pair_key)
  WHERE chunk_a_id IS NOT NULL AND chunk_b_id IS NOT NULL;

-- Admin page and nav badge: a school's conflicts by status.
CREATE INDEX IF NOT EXISTS idx_document_conflicts_school_status
  ON public.document_conflicts (school_id, status);

-- Chat: resolved conflicts touching the retrieved documents.
CREATE INDEX IF NOT EXISTS idx_document_conflicts_resolved_doc_a
  ON public.document_conflicts (school_id, document_a_id) WHERE status = 'resolved';
CREATE INDEX IF NOT EXISTS idx_document_conflicts_resolved_doc_b
  ON public.document_conflicts (school_id, document_b_id) WHERE status = 'resolved';

-- ON DELETE SET NULL / CASCADE from document_chunks / documents looks rows up by these.
CREATE INDEX IF NOT EXISTS idx_document_conflicts_chunk_a
  ON public.document_conflicts (chunk_a_id);
CREATE INDEX IF NOT EXISTS idx_document_conflicts_chunk_b
  ON public.document_conflicts (chunk_b_id);
CREATE INDEX IF NOT EXISTS idx_document_conflicts_document_a
  ON public.document_conflicts (document_a_id);
CREATE INDEX IF NOT EXISTS idx_document_conflicts_document_b
  ON public.document_conflicts (document_b_id);

ALTER TABLE public.document_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School admins can read document conflicts"
  ON public.document_conflicts;
CREATE POLICY "School admins can read document conflicts"
  ON public.document_conflicts FOR SELECT
  TO authenticated
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "School admins can update document conflicts"
  ON public.document_conflicts;
CREATE POLICY "School admins can update document conflicts"
  ON public.document_conflicts FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_admin(school_id) OR public.is_super_admin());

-- Supabase no longer grants new objects to the API roles implicitly. Scans
-- insert with the service role; admins only ever read and rule.
REVOKE ALL ON public.document_conflicts FROM PUBLIC;
REVOKE ALL ON public.document_conflicts FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.document_conflicts TO authenticated;
GRANT ALL ON public.document_conflicts TO service_role;

-- ── 2. conflict_scan_runs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conflict_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  trigger text NOT NULL DEFAULT 'manual'
    CHECK (trigger IN ('manual', 'cron', 'script')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  requested_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  documents_scanned integer NOT NULL DEFAULT 0,
  pairs_considered integer NOT NULL DEFAULT 0,
  pairs_judged integer NOT NULL DEFAULT 0,
  conflicts_found integer NOT NULL DEFAULT 0,
  error text
);

COMMENT ON TABLE public.conflict_scan_runs IS
  'One row per document-conflict scan, for "last scanned" in Admin > Conflicts and the daily cron''s incremental window.';

CREATE INDEX IF NOT EXISTS idx_conflict_scan_runs_school_started
  ON public.conflict_scan_runs (school_id, started_at DESC);

ALTER TABLE public.conflict_scan_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School admins can read conflict scan runs"
  ON public.conflict_scan_runs;
CREATE POLICY "School admins can read conflict scan runs"
  ON public.conflict_scan_runs FOR SELECT
  TO authenticated
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

REVOKE ALL ON public.conflict_scan_runs FROM PUBLIC;
REVOKE ALL ON public.conflict_scan_runs FROM anon, authenticated;
GRANT SELECT ON public.conflict_scan_runs TO authenticated;
GRANT ALL ON public.conflict_scan_runs TO service_role;

-- ── 3. find_conflict_candidates ───────────────────────────────────
-- Pairs of chunks from different ready documents of one school whose cosine
-- similarity is at least p_threshold, best first, skipping pairs already in
-- document_conflicts (any status). A conflict seen before between chunks
-- since replaced is caught by its statements, in TS (candidates.ts).
--
-- Source chunks are the school's chunks, or only those of p_document_ids
-- (an incremental scan: new documents against the rest of the school). Each
-- source chunk takes its p_neighbors nearest chunks from the HNSW index
-- (document_chunks_embedding_idx) via LATERAL — never an all-pairs join.
-- Callers pass document ids in batches to keep each call short.
--
-- The index is shared by every school, so the school filter is applied
-- during the index scan: pgvector >= 0.8 keeps scanning until it has enough
-- matching rows (hnsw.iterative_scan); older versions settle for what
-- hnsw.ef_search candidates survive the filter. These settings are local to
-- the call and skipped if the server doesn't know them.
CREATE OR REPLACE FUNCTION public.find_conflict_candidates(
  p_school_id uuid,
  p_document_ids uuid[] DEFAULT NULL,
  p_threshold double precision DEFAULT 0.85,
  p_neighbors integer DEFAULT 8,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  chunk_a_id uuid,
  chunk_b_id uuid,
  document_a_id uuid,
  document_b_id uuid,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
#variable_conflict use_column
BEGIN
  BEGIN
    PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true);
  EXCEPTION WHEN others THEN
    NULL;
  END;
  BEGIN
    PERFORM set_config('hnsw.ef_search', '200', true);
  EXCEPTION WHEN others THEN
    NULL;
  END;
  -- In case the embedding index is still IVFFlat (see 036).
  BEGIN
    PERFORM set_config('ivfflat.probes', '10', true);
  EXCEPTION WHEN others THEN
    NULL;
  END;

  RETURN QUERY
  WITH src AS (
    SELECT dc.id, dc.document_id, dc.embedding
    FROM public.document_chunks dc
    JOIN public.documents d ON d.id = dc.document_id
    WHERE dc.school_id = p_school_id
      AND d.status = 'ready'
      AND dc.embedding IS NOT NULL
      AND (p_document_ids IS NULL OR dc.document_id = ANY (p_document_ids))
  ),
  near AS (
    SELECT
      src.id AS a_id,
      src.document_id AS a_doc,
      nb.id AS b_id,
      nb.document_id AS b_doc,
      1 - nb.distance AS sim
    FROM src
    CROSS JOIN LATERAL (
      SELECT o.id, o.document_id, o.embedding <=> src.embedding AS distance
      FROM public.document_chunks o
      WHERE o.school_id = p_school_id
        AND o.document_id <> src.document_id
      ORDER BY o.embedding <=> src.embedding
      LIMIT greatest(p_neighbors, 1)
    ) nb
    WHERE 1 - nb.distance >= p_threshold
  ),
  -- Each unordered pair once (both chunks may have found the other).
  pairs AS (
    SELECT DISTINCT ON (least(near.a_id, near.b_id), greatest(near.a_id, near.b_id))
      near.a_id, near.a_doc, near.b_id, near.b_doc, near.sim,
      least(near.a_id, near.b_id)::text || ':' || greatest(near.a_id, near.b_id)::text AS pair_key
    FROM near
    ORDER BY least(near.a_id, near.b_id), greatest(near.a_id, near.b_id), near.sim DESC
  )
  SELECT p.a_id, p.b_id, p.a_doc, p.b_doc, p.sim::double precision
  FROM pairs p
  JOIN public.documents db ON db.id = p.b_doc AND db.status = 'ready'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.document_conflicts c
    WHERE c.school_id = p_school_id AND c.pair_key = p.pair_key
      -- Lets the planner use the partial unique index.
      AND c.chunk_a_id IS NOT NULL AND c.chunk_b_id IS NOT NULL
  )
  ORDER BY p.sim DESC
  LIMIT greatest(p_limit, 0);
END;
$$;

COMMENT ON FUNCTION public.find_conflict_candidates(uuid, uuid[], double precision, integer, integer) IS
  'Candidate conflicting chunk pairs (different documents, cosine similarity >= threshold, not yet judged) for one school. Service role only.';

REVOKE EXECUTE ON FUNCTION public.find_conflict_candidates(uuid, uuid[], double precision, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_conflict_candidates(uuid, uuid[], double precision, integer, integer)
  TO service_role;

COMMIT;
