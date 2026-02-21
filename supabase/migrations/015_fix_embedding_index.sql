-- ============================================
-- 015_fix_embedding_index.sql
-- Replace IVFFlat index with HNSW for better recall.
--
-- IVFFlat with lists=100 and default probes=1 only searches ~1%
-- of vectors per query, causing newly inserted chunks (like
-- admin responses) to be invisible to semantic search.
-- HNSW provides much better recall without needing to tune probes.
-- ============================================

-- Drop the IVFFlat index
DROP INDEX IF EXISTS document_chunks_embedding_idx;

-- Create HNSW index (better recall, no probes tuning needed)
CREATE INDEX document_chunks_embedding_idx
  ON public.document_chunks
  USING hnsw (embedding vector_cosine_ops);
