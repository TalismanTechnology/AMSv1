-- ============================================
-- 052_retire_unscoped_retrieval.sql
-- Take the old, unscoped retrieval functions away from every API role.
--
-- APPLY ONLY AFTER the code from the mailing-list intake PR (which calls
-- match_document_chunks_v2 / search_document_chunks_v2) is deployed.
-- Applying it earlier breaks chat retrieval and content search on the
-- previous deploy.
--
-- match_document_chunks and search_document_chunks don't know who is asking,
-- so with the service role they return chunks of grade-restricted documents
-- (051). Once nothing calls them, revoking EXECUTE makes any future code that
-- tries fail loudly instead of leaking. The functions stay (no DROP), so this
-- is undone with GRANT EXECUTE … TO service_role, authenticated.
-- ============================================

REVOKE EXECUTE ON FUNCTION public.search_document_chunks(uuid, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.match_document_chunks(extensions.vector, double precision, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.match_document_chunks(extensions.vector, uuid, double precision, integer)
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
