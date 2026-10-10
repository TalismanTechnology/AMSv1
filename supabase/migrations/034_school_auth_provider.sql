-- ============================================
-- 034_school_auth_provider.sql
-- Per-school parent sign-in provider: Blackbaud (existing) or Veracross.
--
-- MUST BE APPLIED MANUALLY (Supabase SQL editor / `supabase db push`).
-- Numbered after 031 (PR #8), 032 (PR #10) and 033 (PR #13); apply after
-- them. It touches none of their objects, so the order is for bookkeeping.
--
-- Safe to deploy the code first: until this runs, every school resolves to
-- Blackbaud (the column default below) and Veracross sign-in stays off.
--
-- Veracross sign-in uses the school's own OAuth Application (Axiom →
-- Identity & Access Management → OAuth Applications), so unlike Blackbaud
-- the per-school secret is a client id/secret pair. The secret is AES-256-GCM
-- encrypted at the app layer with BLACKBAUD_TOKEN_ENC_KEY, exactly like the
-- Blackbaud refresh tokens in blackbaud_connections. See docs/VERACROSS.md.
-- ============================================

-- ── 1. Which provider a school's parents sign in with ──────────────
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'blackbaud';

ALTER TABLE public.schools
  DROP CONSTRAINT IF EXISTS schools_auth_provider_check;

ALTER TABLE public.schools
  ADD CONSTRAINT schools_auth_provider_check
  CHECK (auth_provider IN ('blackbaud', 'veracross'));

-- ── 2. Per-school Veracross OAuth Application ──────────────────────
CREATE TABLE IF NOT EXISTS public.veracross_connections (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,

  -- The school's route: the path segment in axiom.veracross.com/<route> and
  -- accounts.veracross.com/<route>. Every Veracross URL is built from it.
  school_route text NOT NULL
    CHECK (school_route ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'),

  client_id text NOT NULL,
  client_secret_ciphertext text NOT NULL,
  client_secret_iv text NOT NULL,
  client_secret_tag text NOT NULL,

  -- Space-separated scopes requested at sign-in. Must include `sso` (OAuth
  -- 2.0) or `openid` (OIDC), whichever the school enabled on the app.
  scopes text NOT NULL DEFAULT 'sso'
    CHECK (scopes ~ '(^|\s)(sso|openid)(\s|$)'),

  -- Veracross roles (from /oauth/userinfo) that count as a parent.
  parent_roles text[] NOT NULL DEFAULT ARRAY['Parent']::text[]
    CHECK (cardinality(parent_roles) > 0),

  -- When true the school also enabled the Data API scopes listed in
  -- docs/VERACROSS.md, and sign-in fills in the parent's children + grades.
  data_api_enabled boolean NOT NULL DEFAULT false,

  enabled boolean NOT NULL DEFAULT true,
  last_error text,
  last_error_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One AskMySchool school per Veracross school.
CREATE UNIQUE INDEX IF NOT EXISTS idx_veracross_connections_route
  ON public.veracross_connections(lower(school_route));

ALTER TABLE public.veracross_connections ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: credentials are reachable only with the service
-- role (scripts/veracross-connect.ts and the sign-in routes).

-- ── 3. Which Veracross account an AskMySchool parent is ────────────
-- Accounts are keyed on email (as with Blackbaud). This records the stable
-- Veracross account id (`sub`, unique per school route) behind that email, so
-- a later sign-in from a DIFFERENT Veracross account with the same email (an
-- address reassigned at the school) is refused instead of silently landing in
-- someone else's AskMySchool account.
CREATE TABLE IF NOT EXISTS public.veracross_parent_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_sub text NOT NULL,
  -- Veracross Person ID, when the Data API lookup found one.
  person_id bigint,
  first_linked_at timestamptz NOT NULL DEFAULT now(),
  last_sign_in_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, account_sub),
  UNIQUE (school_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_veracross_parent_links_user
  ON public.veracross_parent_links(user_id);

ALTER TABLE public.veracross_parent_links ENABLE ROW LEVEL SECURITY;
-- No policies: written and read only by the sign-in callback (service role).

-- ── 4. Children that came from the school's records ────────────────
-- Lets a later sign-in update a child's grade instead of duplicating it.
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_children_external
  ON public.children(parent_id, school_id, external_source, external_id)
  WHERE external_id IS NOT NULL;

-- ── 5. Explicit grants ─────────────────────────────────────────────
-- Supabase no longer grants new objects to the API roles implicitly, so
-- spell out who may touch the new tables. Both hold third-party credentials
-- or identifiers and are service-role only; anon/authenticated get nothing.
-- (schools and children are existing tables whose grants are unchanged;
-- new columns inherit the table-level grants.)
REVOKE ALL ON public.veracross_connections FROM anon, authenticated;
REVOKE ALL ON public.veracross_parent_links FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.veracross_connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.veracross_parent_links TO service_role;
