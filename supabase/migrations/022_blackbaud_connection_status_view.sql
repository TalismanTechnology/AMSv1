-- ============================================
-- 022_blackbaud_connection_status_view.sql
-- Stop exposing encrypted token columns to school admins.
--
-- 021 granted admins SELECT on all of blackbaud_connections, with only a code
-- comment stopping a `select('*')` from shipping refresh_token_ciphertext + iv
-- + tag to the browser. Replace that with a view that cannot expose them.
-- ============================================

DROP POLICY IF EXISTS "School admins can view their Blackbaud connection"
  ON public.blackbaud_connections;

-- No SELECT policy remains on the base table, so the anon/auth roles cannot
-- read it at all. Service-role code (createAdminClient) is unaffected.

-- Status-only projection. Runs as owner and therefore bypasses the base
-- table's RLS, so access control lives in the WHERE clause instead.
CREATE OR REPLACE VIEW public.blackbaud_connection_status AS
  SELECT
    school_id,
    environment_id,
    status,
    last_synced_at,
    last_error,
    created_at,
    updated_at
  FROM public.blackbaud_connections
  WHERE public.is_school_admin(school_id) OR public.is_super_admin();

REVOKE ALL ON public.blackbaud_connection_status FROM anon;
GRANT SELECT ON public.blackbaud_connection_status TO authenticated;
