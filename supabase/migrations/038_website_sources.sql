-- ============================================
-- 038_website_sources.sql
-- Website sources: a school's public website is crawled and its pages (and
-- same-host PDFs) are ingested as documents, then kept up to date by a daily
-- resumable sync (app/api/cron/sync-websites, lib/website/).
--
-- MUST BE APPLIED MANUALLY (Supabase SQL editor / `supabase db push`).
-- Additive only: three new tables, two new documents columns, and the
-- documents.source check widened to allow 'website'.
--
-- Safe to deploy the code first: the admin UI reports the missing tables and
-- the cron route no-ops (its queries fail and are logged) until this runs.
-- ============================================

BEGIN;

-- ── 1. Documents can come from a website ──────────────────────────
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS source_url text;

-- Recreated with every value allowed so far: 019 added ('upload', 'email').
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_source_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_source_check
  CHECK (source IN ('upload', 'email', 'website'));

-- ── 2. One row per website a school wants crawled ─────────────────
CREATE TABLE IF NOT EXISTS public.website_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

  root_url text NOT NULL CHECK (root_url ~* '^https?://'),
  -- Path globs/prefixes, one per entry. Empty include list = whole site.
  include_patterns text[] NOT NULL DEFAULT '{}',
  exclude_patterns text[] NOT NULL DEFAULT '{}',
  max_pages integer NOT NULL DEFAULT 300 CHECK (max_pages BETWEEN 1 AND 5000),
  enabled boolean NOT NULL DEFAULT true,

  -- Resolved when a run starts: the host the root URL ends up on after
  -- redirects (www vs apex), the scheme, and the robots.txt body the whole
  -- run obeys (so every batch doesn't refetch it).
  canonical_origin text,
  robots_txt text,

  -- Run bookkeeping. current_run increments each time a sync starts; queue
  -- rows and page sightings are tagged with it.
  current_run integer NOT NULL DEFAULT 0,
  -- Held by the batch processing this source so two invocations (cron and
  -- "Sync now") never crawl the same site at once.
  lease_until timestamptz,

  last_sync_started_at timestamptz,
  last_sync_finished_at timestamptz,
  last_sync_status text
    CHECK (last_sync_status IN ('running', 'success', 'partial', 'error', 'cancelled')),
  last_sync_error text,
  page_count integer NOT NULL DEFAULT 0,
  sync_count integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (school_id, root_url)
);

CREATE INDEX IF NOT EXISTS idx_website_sources_status
  ON public.website_sources(last_sync_status, enabled);

-- ── 3. Every page we have ingested (or are tracking) ──────────────
CREATE TABLE IF NOT EXISTS public.website_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.website_sources(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  url text NOT NULL, -- canonical form (lib/website/url.ts)
  kind text NOT NULL DEFAULT 'html' CHECK (kind IN ('html', 'pdf')),
  title text,
  -- sha256 of the extracted text (html) or the file bytes (pdf). Set only
  -- once the document processed successfully, so a failure retries.
  content_hash text,
  etag text,
  last_modified text,
  http_status integer,
  -- Same-site links found on the page, kept so a 304 still feeds discovery.
  links text[] NOT NULL DEFAULT '{}',
  last_seen_at timestamptz,
  last_seen_run integer,
  -- Completed syncs in a row that did not reach this page. At 2 it is deleted.
  missing_count integer NOT NULL DEFAULT 0,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, url)
);

CREATE INDEX IF NOT EXISTS idx_website_pages_source_run
  ON public.website_pages(source_id, last_seen_run);
CREATE INDEX IF NOT EXISTS idx_website_pages_document
  ON public.website_pages(document_id)
  WHERE document_id IS NOT NULL;

-- ── 4. Per-run crawl frontier (resumable across batches) ──────────
CREATE TABLE IF NOT EXISTS public.website_sync_queue (
  id bigserial PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES public.website_sources(id) ON DELETE CASCADE,
  run integer NOT NULL,
  url text NOT NULL,
  kind text NOT NULL DEFAULT 'page' CHECK (kind IN ('page', 'sitemap')),
  depth integer NOT NULL DEFAULT 0,
  -- Lower first: sitemaps 0, then pages breadth-first (depth + 1).
  priority integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'skipped', 'error')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (source_id, run, url)
);

CREATE INDEX IF NOT EXISTS idx_website_sync_queue_next
  ON public.website_sync_queue(source_id, run, status, priority, id);

-- ── 5. Row-level security ─────────────────────────────────────────
-- The crawler runs with the service role (bypasses RLS). School admins
-- manage their own sources and can read pages/queue for progress. Parents
-- get nothing here; they see website content only as documents.
ALTER TABLE public.website_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School admins can manage website sources" ON public.website_sources;
CREATE POLICY "School admins can manage website sources"
  ON public.website_sources FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_admin(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "School admins can view website pages" ON public.website_pages;
CREATE POLICY "School admins can view website pages"
  ON public.website_pages FOR SELECT
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "School admins can view website sync queue" ON public.website_sync_queue;
CREATE POLICY "School admins can view website sync queue"
  ON public.website_sync_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.website_sources s
      WHERE s.id = website_sync_queue.source_id
        AND (public.is_school_admin(s.school_id) OR public.is_super_admin())
    )
  );

-- ── 6. Explicit grants ────────────────────────────────────────────
-- Supabase no longer grants new objects to the API roles implicitly.
REVOKE ALL ON public.website_sources FROM anon;
REVOKE ALL ON public.website_pages FROM anon;
REVOKE ALL ON public.website_sync_queue FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_sources TO authenticated;
GRANT SELECT ON public.website_pages TO authenticated;
GRANT SELECT ON public.website_sync_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_sources TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_pages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_sync_queue TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.website_sync_queue_id_seq TO service_role;

COMMIT;
