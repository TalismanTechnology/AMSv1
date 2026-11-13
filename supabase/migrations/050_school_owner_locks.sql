-- ============================================
-- 050_school_owner_locks.sql
-- School "owner lock": a password a school's own admins can set to keep the
-- platform super-admin out of that school's admin pages and data unless the
-- password is entered. See lib/school-lock/.
--
-- MUST BE APPLIED MANUALLY (Supabase SQL editor / `supabase db push`).
--
-- Safe to deploy the code first: until this runs, the code treats the missing
-- tables as "no school is locked" and the Security settings page says the
-- owner lock isn't available yet.
--
-- What it does:
--   1. Creates school_owner_locks: one row per locked school holding a scrypt
--      hash of the lock password. No row = not locked (the default for every
--      school; no existing data is changed).
--   2. Creates school_owner_lock_attempts: unlock attempts by a super-admin,
--      the rows the unlock rate limit counts.
-- Both tables are service-role only: RLS on with no policies, and anon /
-- authenticated get no grants, so a browser can never read a hash.
-- ============================================

-- ── 1. Locks ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_owner_locks (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  -- "scrypt$N$r$p$<salt>$<hash>" (base64url). Never the password itself.
  password_hash text NOT NULL,
  set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_owner_locks ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: read and written only by the server
-- (lib/school-lock/store.ts) with the service role.

-- ── 2. Unlock attempts (rate limit) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_owner_lock_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  succeeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_owner_lock_attempts_user_school
  ON public.school_owner_lock_attempts(user_id, school_id, created_at DESC);

ALTER TABLE public.school_owner_lock_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: written and read only by the unlock server action.

-- ── 3. Explicit grants ─────────────────────────────────────────────
REVOKE ALL ON public.school_owner_locks FROM anon, authenticated;
REVOKE ALL ON public.school_owner_lock_attempts FROM anon, authenticated;
GRANT ALL ON public.school_owner_locks TO service_role;
GRANT ALL ON public.school_owner_lock_attempts TO service_role;
