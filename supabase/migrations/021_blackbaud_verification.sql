-- ============================================
-- 021_blackbaud_verification.sql
-- Per-school Blackbaud SKY API connection + synced parent roster
-- ============================================

-- ── Per-school feature flag ──────────────────────────
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS blackbaud_verification_enabled boolean NOT NULL DEFAULT false;

-- ── Per-school OAuth connection ──────────────────────
-- One row per school. Holds the encrypted refresh token granted when that
-- school authorizes our app against their own Blackbaud environment.
-- Secrets are AES-256-GCM encrypted at the app layer; the DB never sees plaintext.
CREATE TABLE IF NOT EXISTS public.blackbaud_connections (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  environment_id text,
  legal_entity_id text,

  refresh_token_ciphertext text NOT NULL,
  refresh_token_iv text NOT NULL,
  refresh_token_tag text NOT NULL,

  -- Short-lived access token cache (~60 min); avoids a refresh on every call.
  access_token_ciphertext text,
  access_token_iv text,
  access_token_tag text,
  access_token_expires_at timestamptz,

  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'expired', 'error')),
  last_synced_at timestamptz,
  last_error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blackbaud_connections ENABLE ROW LEVEL SECURITY;

-- School admins may read their own connection row to render status in the UI.
-- Never `select('*')` this table from the client — select status columns only.
CREATE POLICY "School admins can view their Blackbaud connection"
  ON public.blackbaud_connections FOR SELECT
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

-- No INSERT/UPDATE/DELETE policies: writes are service-role only.

-- ── Synced parent/guardian roster ────────────────────
-- Populated nightly from GET /school/v1/users/extended. Login-time email
-- matching hits this local table instead of the SKY API (rate limits, latency).
CREATE TABLE IF NOT EXISTS public.blackbaud_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  bb_user_id text NOT NULL,
  email text NOT NULL,              -- always stored trimmed + lowercased
  first_name text,
  last_name text,
  roles text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, email),
  UNIQUE (school_id, bb_user_id)
);

CREATE INDEX IF NOT EXISTS idx_bb_roster_school_email
  ON public.blackbaud_roster(school_id, email)
  WHERE is_active;

ALTER TABLE public.blackbaud_roster ENABLE ROW LEVEL SECURITY;

-- Deliberately NO policies. This table holds third-party PII and must be
-- unreachable with the anon/auth key. All access goes through
-- createAdminClient() on the server, always filtered by school_id.
