-- Add AI-generated summary column to documents
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS summary text;

-- Add a generated tsvector column on document_chunks for full-text search
ALTER TABLE public.document_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- GIN index for fast full-text queries
CREATE INDEX IF NOT EXISTS idx_document_chunks_fts
  ON public.document_chunks
  USING GIN (content_tsv);

-- RPC function for full-text content search
CREATE OR REPLACE FUNCTION search_document_chunks(
  p_school_id uuid,
  p_query text,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  document_id uuid,
  document_title text,
  content text,
  chunk_index int,
  rank real
)
LANGUAGE sql STABLE
AS $$
  SELECT
    dc.document_id,
    d.title AS document_title,
    dc.content,
    dc.chunk_index,
    ts_rank(dc.content_tsv, websearch_to_tsquery('english', p_query)) AS rank
  FROM public.document_chunks dc
  JOIN public.documents d ON d.id = dc.document_id
  WHERE dc.school_id = p_school_id
    AND d.status = 'ready'
    AND dc.content_tsv @@ websearch_to_tsquery('english', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
$$;
