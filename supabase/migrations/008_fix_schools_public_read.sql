-- ============================================
-- 008_fix_schools_public_read.sql
-- Idempotent fix: ensure schools are publicly readable.
-- Safe to run whether 007 was applied with the old or new policy.
-- ============================================

-- Drop both possible policy names (old and new)
DROP POLICY IF EXISTS "Authenticated users can read schools" ON public.schools;
DROP POLICY IF EXISTS "Anyone can read schools" ON public.schools;

-- Allow anyone (including unauthenticated) to read schools
CREATE POLICY "Anyone can read schools"
  ON public.schools FOR SELECT
  USING (true);
