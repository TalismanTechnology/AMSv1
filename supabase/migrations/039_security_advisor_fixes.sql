-- ============================================
-- 039_security_advisor_fixes.sql
-- Supabase security advisor fixes (Oct 2026). Additive / non-destructive.
-- ============================================

-- 1. security_definer_view: blackbaud_connection_status.
-- The view ran as owner to bypass the base table's RLS (022). Make it
-- security_invoker and instead give authenticated users a column-limited,
-- row-limited read on the base table. Token ciphertext/iv/tag columns are
-- not granted, so they still cannot reach a browser.
REVOKE ALL ON public.blackbaud_connections FROM anon, authenticated;
GRANT SELECT (school_id, environment_id, status, last_synced_at, last_error, created_at, updated_at)
  ON public.blackbaud_connections TO authenticated;

DROP POLICY IF EXISTS "School admins can read Blackbaud connection status" ON public.blackbaud_connections;
CREATE POLICY "School admins can read Blackbaud connection status"
  ON public.blackbaud_connections FOR SELECT TO authenticated
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

ALTER VIEW public.blackbaud_connection_status SET (security_invoker = true);

-- 2. function_search_path_mutable: pin search_path (vector lives in extensions).
ALTER FUNCTION public.is_super_admin() SET search_path = public, extensions;
ALTER FUNCTION public.is_school_admin(uuid) SET search_path = public, extensions;
ALTER FUNCTION public.is_school_member(uuid) SET search_path = public, extensions;
ALTER FUNCTION public.is_admin() SET search_path = public, extensions;
ALTER FUNCTION public.handle_new_user() SET search_path = public, extensions;
ALTER FUNCTION public.search_document_chunks(uuid, text, integer) SET search_path = public, extensions;
ALTER FUNCTION public.match_nearest_cluster(extensions.vector, uuid, double precision) SET search_path = public, extensions;
ALTER FUNCTION public.match_document_chunks(extensions.vector, double precision, integer) SET search_path = public, extensions;
ALTER FUNCTION public.match_document_chunks(extensions.vector, uuid, double precision, integer) SET search_path = public, extensions;
ALTER FUNCTION public.check_inbound_address_division() SET search_path = public, extensions;
ALTER FUNCTION public.check_document_division() SET search_path = public, extensions;
ALTER FUNCTION public.check_category_parent() SET search_path = public, extensions;
ALTER FUNCTION public.check_row_category_school() SET search_path = public, extensions;
ALTER FUNCTION public.check_bb_event_suggested_category_school() SET search_path = public, extensions;

-- 3. *_security_definer_function_executable: trigger / event-trigger
-- functions never need EXECUTE by API roles (privilege is checked only at
-- CREATE TRIGGER time), so remove them from /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_new_school_subdivisions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
-- is_*() and chat_message_flag_reason() are intentionally left executable:
-- RLS policies call them as the requesting role.
