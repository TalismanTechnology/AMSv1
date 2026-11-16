-- ============================================
-- 053_google_auth_sessions.sql
-- Marks the Supabase Auth sessions that were started by "Continue with
-- Google", so ADMIN_GOOGLE_ONLY (lib/auth/admin-google-only.ts) can tell
-- them apart from password / email-code / magic-link sessions. The token's
-- `amr` can't: the native app's Google sign-in ends in a magic-link verify
-- and says "otp", like a parent's email code.
--
-- MUST BE APPLIED MANUALLY (Supabase SQL editor / `supabase db push`).
--
-- Additive and safe to apply before the code deploys: nothing reads it until
-- the new code runs, and nothing enforces it until ADMIN_GOOGLE_ONLY=true.
-- Apply it BEFORE turning ADMIN_GOOGLE_ONLY on: without it no session counts
-- as Google and every admin is refused (fails closed).
--
-- Written only by /auth/callback and /auth/app-handoff with the service role,
-- read only by the server with the service role. RLS on with no policies and
-- no grants for anon / authenticated, so no signed-in user can mark their own
-- session as a Google one.
-- ============================================

CREATE TABLE IF NOT EXISTS public.google_auth_sessions (
  -- The access token's session_id claim (= auth.sessions.id). Stays the same
  -- across token refreshes.
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 'web': /auth/callback; 'app': the native app's /auth/app-handoff.
  via text NOT NULL CHECK (via IN ('web', 'app'))
);

-- For cleanup of rows whose session is long gone (see below).
CREATE INDEX IF NOT EXISTS idx_google_auth_sessions_created_at
  ON public.google_auth_sessions(created_at);

ALTER TABLE public.google_auth_sessions ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies.
REVOKE ALL ON public.google_auth_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.google_auth_sessions TO service_role;

-- Rows go away with their session (sign-out, expiry clean-up, user deletion)
-- when the project lets us reference auth.sessions. If it doesn't, the table
-- still works: a row for a deleted session is never matched again (session
-- ids are random and never reused), it's just clutter; clean up with
--   DELETE FROM public.google_auth_sessions WHERE created_at < now() - interval '90 days';
-- (or, where auth.sessions is readable:
--   DELETE FROM public.google_auth_sessions g
--   WHERE NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = g.session_id);)
DO $$
BEGIN
  IF to_regclass('auth.sessions') IS NULL THEN
    RAISE NOTICE 'auth.sessions not found; google_auth_sessions rows are not tied to sessions';
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'google_auth_sessions_session_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE public.google_auth_sessions
        ADD CONSTRAINT google_auth_sessions_session_id_fkey
        FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'No REFERENCES on auth.sessions; google_auth_sessions rows are not tied to sessions';
    END;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
