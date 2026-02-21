-- Switch from OpenAI text-embedding-3-small (1536 dims) to
-- Google text-embedding-004 (768 dims).
-- Any existing embeddings must be regenerated after this migration.

-- Drop the old index (it references the old vector size)
drop index if exists document_chunks_embedding_idx;

-- Clear existing embeddings (they are incompatible with the new model)
update public.document_chunks set embedding = null;

-- Alter the column to the new dimension
alter table public.document_chunks
  alter column embedding type vector(768);

-- Recreate the IVFFlat index
create index on public.document_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Recreate the search function with the new vector size
create or replace function match_document_chunks(
  query_embedding vector(768),
  match_threshold float default 0.7,
  match_count int default 8
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.documents d on dc.document_id = d.id
  where d.status = 'ready'
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
