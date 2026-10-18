-- ============================================
-- 044_school_roster.sql
-- Parent roster + emailed one-time-code sign-in ("roster" provider), and an
-- optional per-school "require roster match" gate for every provider.
--
-- MUST BE APPLIED MANUALLY (Supabase SQL editor / `supabase db push`).
-- Numbered after 043 (open PR); it touches none of 043's objects, so the
-- order is for bookkeeping. Requires 034 (schools.auth_provider,
-- children.external_source / external_id).
--
-- Safe to deploy the code first: until this runs, the code treats the
-- missing tables/columns as "feature not installed" — no school can pick the
-- roster provider, the require-roster-match gate is off everywhere, and the
-- admin settings card says roster sign-in isn't available yet.
--
-- What it does:
--   1. Allows schools.auth_provider = 'roster' (default stays 'blackbaud').
--   2. Adds schools.require_roster_match (default false: no school changes).
--   3. Creates school_roster: the parent list a school admin uploads as CSV.
--   4. Creates parent_login_codes: emailed sign-in codes (stored only as
--      HMACs) and the rows the rate limits count.
-- No existing data is changed. blackbaud_roster is untouched.
-- See docs/ROSTER_SIGN_IN.md.
-- ============================================

-- ── 1. 'roster' as a parent sign-in provider ───────────────────────
ALTER TABLE public.schools
  DROP CONSTRAINT IF EXISTS schools_auth_provider_check;

ALTER TABLE public.schools
  ADD CONSTRAINT schools_auth_provider_check
  CHECK (auth_provider IN ('blackbaud', 'veracross', 'roster'));

-- ── 2. Optional gate: parents must also be on the roster ───────────
-- Applies to every provider (Blackbaud, Veracross, roster). Off by default.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS require_roster_match boolean NOT NULL DEFAULT false;

-- ── 3. Parent roster uploaded by the school ────────────────────────
-- One row per parent/guardian email. Rows missing from a later upload are
-- deactivated (is_active = false), never deleted.
CREATE TABLE IF NOT EXISTS public.school_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  -- Always stored trimmed + lowercased, so login-time matching is exact.
  email text NOT NULL CHECK (email = lower(btrim(email))),
  first_name text,
  last_name text,
  -- [{ "name": "Ava Smith", "grade": "3" }, …]; grade uses lib/grades.ts
  -- values ("Pre-K", "K", "1"–"12") or null when the file's grade wasn't
  -- recognised.
  children jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'csv',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, email)
);

CREATE INDEX IF NOT EXISTS idx_school_roster_active_email
  ON public.school_roster(school_id, email)
  WHERE is_active;

ALTER TABLE public.school_roster ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: parent PII, reachable only with the service role
-- (lib/roster/store.ts), always filtered by school_id.

-- ── 4. Emailed sign-in codes ───────────────────────────────────────
-- Codes are stored only as HMAC-SHA256(school:email:code) keyed with a
-- server secret, never in plain text. Rows also back the rate limits (per
-- school + email and per hashed IP), so they work across serverless
-- instances. ip_hash is a keyed hash, not the address.
CREATE TABLE IF NOT EXISTS public.parent_login_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_login_codes_school_email
  ON public.parent_login_codes(school_id, email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parent_login_codes_ip
  ON public.parent_login_codes(ip_hash, created_at DESC);

ALTER TABLE public.parent_login_codes ENABLE ROW LEVEL SECURITY;
-- No policies: written and read only by the sign-in server actions.

-- ── 5. Explicit grants ─────────────────────────────────────────────
-- Service role only; anon/authenticated get nothing. (schools is an existing
-- table whose grants are unchanged; the new column inherits them.)
REVOKE ALL ON public.school_roster FROM anon, authenticated;
REVOKE ALL ON public.parent_login_codes FROM anon, authenticated;
GRANT ALL ON public.school_roster TO service_role;
GRANT ALL ON public.parent_login_codes TO service_role;
