-- ============================================
-- 026_native_app.sql
-- Support for the iOS / Android apps (Capacitor shells around the site).
--
-- 1. app_sign_in_handoffs: Blackbaud sign-in runs in the system sign-in sheet,
--    whose cookies the app's web view can't see. The callback stores a
--    one-time code here and hands it to the app; the web view redeems it for
--    a session. Service role only.
-- 2. push_devices: one row per phone that allowed notifications.
-- ============================================

CREATE TABLE IF NOT EXISTS public.app_sign_in_handoffs (
  -- SHA-256 of the code; the code itself is never stored.
  code_hash text PRIMARY KEY,
  email text NOT NULL,
  school_slug text NOT NULL,
  -- S256 of a verifier only the app that started sign-in holds, so a code
  -- intercepted on its way to the app can't be redeemed by anyone else.
  app_challenge text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_sign_in_handoffs_expires_at_idx
  ON public.app_sign_in_handoffs (expires_at);

ALTER TABLE public.app_sign_in_handoffs ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role reads or writes handoffs.

CREATE TABLE IF NOT EXISTS public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  -- APNs device token (iOS) or FCM registration token (Android).
  token text NOT NULL UNIQUE CHECK (char_length(token) BETWEEN 16 AND 4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_devices_user_id_idx ON public.push_devices (user_id);

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

-- Writes go through the server with the service role (a token can move
-- between accounts on a shared phone); users may only see their own devices.
CREATE POLICY "Users can read their own push devices"
  ON public.push_devices FOR SELECT
  USING (user_id = auth.uid());
