-- ============================================
-- 036_performance_indexes.sql
-- Btree indexes for query shapes the app actually runs that no existing
-- index or PK/unique constraint covers. Indexes only: no tables, columns,
-- functions, views, policies or grants change, so RLS, school scoping and
-- the match_* / search_* RPCs behave exactly as before (indexes need no
-- GRANTs).
--
-- HOW TO APPLY — READ FIRST
-- CREATE INDEX CONCURRENTLY builds without blocking writes (chat inserts,
-- document processing keep working), but it CANNOT run inside a transaction
-- block. So:
--   * psql, statement by statement (psql autocommits each one):
--       psql "$DATABASE_URL" -f supabase/migrations/036_performance_indexes.sql
--     Do NOT pass -1 / --single-transaction.
--   * Supabase SQL editor: run ONE statement at a time. The editor sends a
--     multi-statement script as a single transaction, which fails with
--     "CREATE INDEX CONCURRENTLY cannot run inside a transaction block".
--   * `supabase db push` and other migration runners wrap each file in a
--     transaction. Either apply this file manually as above, or delete the
--     word CONCURRENTLY first (the build then takes a SHARE lock that blocks
--     writes to that table until it finishes).
-- If a concurrent build fails or is cancelled it leaves an INVALID index
-- behind, and IF NOT EXISTS will then skip it. Check with the query in
-- docs/migrations/036-apply.md, DROP INDEX CONCURRENTLY the invalid one,
-- and re-run that statement.
--
-- Numbered 036 after 035_ai_processing_consent.sql (034 is reserved for an
-- open PR). Independent of every other migration; safe to run twice.
-- ============================================

-- ── document_chunks: chunks of one document ──────────
-- No index on document_id existed (only school_id, the FTS GIN and the HNSW
-- embedding index), so each of these scanned every school's chunks:
--   lib/ai/rag.ts:488                      .in(document_id).in(chunk_index)  (neighbour chunks, every chat turn)
--   app/api/documents/[id]/content/route.ts:33  .eq(document_id).order(chunk_index)
--   lib/documents/get-document-text.ts:37  .eq(document_id).eq(school_id).order(chunk_index)
--   actions/documents.ts:426               .in(document_id).eq(chunk_index, 0)
--   lib/documents/processor.ts:144         .delete().eq(document_id)  (every (re)process)
-- It also serves the ON DELETE CASCADE from documents.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_document_chunk
  ON public.document_chunks (document_id, chunk_index);

-- ── events: a school's calendar by date ──────────────
-- Existing: idx_events_school (school_id), idx_events_date (date) — separate.
--   lib/ai/context.ts:43                   school_id, ORDER BY date DESC LIMIT n, count exact (every chat turn)
--   app/s/[slug]/(dashboard)/parent/page.tsx:29        school_id, date >= today ORDER BY date LIMIT 3
--   app/s/[slug]/(dashboard)/parent/events/page.tsx:24 school_id, date BETWEEN ...
--   app/s/[slug]/(dashboard)/admin/events/page.tsx:19  school_id ORDER BY date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_school_date
  ON public.events (school_id, date);

-- ── documents: a school's ready documents, newest first ──
-- Existing: idx_documents_school (school_id), idx_documents_folder_id.
--   actions/parent-documents.ts:18                       school_id, status='ready' ORDER BY created_at DESC
--   app/s/[slug]/(dashboard)/parent/documents/page.tsx:23  same
--   app/s/[slug]/(dashboard)/admin/events/page.tsx:31    same
--   lib/documents/auto-sort.ts:95                        same + LIMIT
--   actions/sorting.ts:231                               same + category_id IS NULL
--   app/s/[slug]/(dashboard)/admin/page.tsx:46           count, school_id + status='ready'
--   actions/analytics.ts:91,103                          school_id + status='ready'
--   actions/document-audit.ts:33                         school_id + status='ready'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_school_status_created
  ON public.documents (school_id, status, created_at DESC);

-- ── analytics_events: a school's questions over a time range ──
-- Existing: (created_at), (event_type, created_at), (school_id) — none
-- combines school with type + time, so the per-school dashboard read every
-- school's question events for the range.
--   actions/analytics.ts:83                         event_type='question', created_at >= X, school_id ORDER BY created_at
--   app/s/[slug]/(dashboard)/admin/page.tsx:62      count, school_id, event_type='question', created_at >= today
--   app/s/[slug]/(dashboard)/admin/page.tsx:68      count, school_id, event_type='question'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_school_type_created
  ON public.analytics_events (school_id, event_type, created_at);

-- ── analytics_events: one user's events (account deletion) ──
-- user_id had no index; it is the largest append-only table.
--   lib/account/delete-account.ts:60   DELETE ... WHERE user_id = $1
-- Also the FK check for analytics_events_user_id_fkey (ON DELETE CASCADE,
-- migration 033) when the profile row is deleted.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_user
  ON public.analytics_events (user_id);

-- ── chat_messages: parents' questions over a time range ──
-- Existing: (session_id, created_at), (school_id). Nothing on created_at, so
-- the hourly-distribution query read the whole table. Partial: only 'user'
-- rows are queried, which keeps the index (and insert cost) to ~half.
--   actions/analytics.ts:109   role='user', created_at >= X  (joined to chat_sessions for school)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_user_created
  ON public.chat_messages (created_at)
  WHERE role = 'user';

-- ── chat_feedback: a school's thumbs up / down totals ──
-- Existing: (message_id), unique (message_id, user_id). No school_id index.
--   app/s/[slug]/(dashboard)/admin/feedback/page.tsx:90   count, school_id, rating='up'
--   app/s/[slug]/(dashboard)/admin/feedback/page.tsx:95   count, school_id, rating='down'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_feedback_school_rating
  ON public.chat_feedback (school_id, rating);

-- ── unanswered_questions: a school's latest questions ──
-- Existing: (school_id), (created_at), (cluster_id) — separate.
--   actions/unanswered-questions.ts:36   school_id ORDER BY created_at DESC LIMIT 200
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unanswered_questions_school_created
  ON public.unanswered_questions (school_id, created_at DESC);

-- ── pgvector: document_chunks.embedding ──────────────
-- Already HNSW: 015_fix_embedding_index.sql replaced the IVFFlat index with
--   document_chunks_embedding_idx USING hnsw (embedding vector_cosine_ops)
-- with pgvector's defaults (m = 16, ef_construction = 64). That opclass
-- matches the <=> (cosine distance) operator match_document_chunks orders
-- by, and dc.school_id is covered by idx_document_chunks_school (006).
-- Nothing to do here — unless the check in docs/migrations/036-apply.md
-- shows production still has the IVFFlat index (i.e. 015 was never applied).
-- Only in that case, run the block below by hand, verify chat answers, then
-- drop the old index:
--
--   SET maintenance_work_mem = '1GB';   -- session-only; keep under the
--                                       -- instance's RAM (Supabase: ~1/4)
--   SET max_parallel_maintenance_workers = 2;   -- optional, pgvector >= 0.6
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS document_chunks_embedding_hnsw_idx
--     ON public.document_chunks
--     USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
--   RESET maintenance_work_mem;
--   RESET max_parallel_maintenance_workers;
--   -- after verifying:
--   -- DROP INDEX CONCURRENTLY IF EXISTS public.document_chunks_embedding_idx;

-- ── Refresh planner statistics ───────────────────────
ANALYZE public.document_chunks;
ANALYZE public.events;
ANALYZE public.documents;
ANALYZE public.analytics_events;
ANALYZE public.chat_messages;
ANALYZE public.chat_feedback;
ANALYZE public.unanswered_questions;
