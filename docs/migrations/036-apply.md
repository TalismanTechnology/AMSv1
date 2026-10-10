# Applying 036_performance_indexes.sql

Indexes only. No schema, RLS, function or grant changes, and no app deploy
needed. Safe to apply before or after any release.

## 1. Pre-check: confirm the embedding index is HNSW

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'document_chunks';
```

`document_chunks_embedding_idx` should read `USING hnsw (embedding vector_cosine_ops)`.
If it says `ivfflat`, migration 015 was never applied: use the commented-out
HNSW block in the migration (raise `maintenance_work_mem` for that session
first), check that chat answers still look right, then drop the old index.

## 2. Apply

`CREATE INDEX CONCURRENTLY` cannot run inside a transaction.

```bash
psql "$DATABASE_URL" -f supabase/migrations/036_performance_indexes.sql
```

Don't use `-1` / `--single-transaction`. In the Supabase SQL editor, run one
statement at a time. `supabase db push` wraps each file in a transaction, so
either apply this file by hand or remove `CONCURRENTLY` first (that version
blocks writes to each table while its index builds).

Every statement is `IF NOT EXISTS`, so re-running is harmless.

## 3. Verify

Look for builds that failed and left an invalid index (expect no rows):

```sql
SELECT c.relname
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE NOT i.indisvalid;
```

For any row: `DROP INDEX CONCURRENTLY public.<name>;`, then re-run that
`CREATE` statement.

Spot-check a plan (substitute a real school id):

```sql
EXPLAIN SELECT id FROM public.events
WHERE school_id = '<uuid>' ORDER BY date DESC LIMIT 200;
-- expect: Index Scan Backward using idx_events_school_date
```

## Rollback

```sql
DROP INDEX CONCURRENTLY IF EXISTS public.idx_document_chunks_document_chunk;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_events_school_date;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_documents_school_status_created;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_analytics_events_school_type_created;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_analytics_events_user;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_chat_messages_user_created;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_chat_feedback_school_rating;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_unanswered_questions_school_created;
```

## Later, optional cleanup (not part of 036)

Once `pg_stat_user_indexes.idx_scan` shows these are no longer used, they're
covered by a leading prefix of a new composite index and can be dropped:
`idx_events_school`, `idx_documents_school`, `idx_unanswered_questions_school`,
`idx_analytics_events_school`. Don't drop any of them in the same change as 036.
