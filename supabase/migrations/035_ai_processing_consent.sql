-- ============================================
-- 035_ai_processing_consent.sql
-- Records each user's consent to AI processing before they can chat
-- (App Store Review Guideline 5.1.2(i): get permission before sharing personal
-- data with a third-party AI service).
--
-- A parent's question and the relevant school document excerpts are sent to
-- Google's Gemini API to generate an answer. The chat API route
-- (app/api/chat/route.ts) refuses to call the model until
-- ai_consent_at is set AND ai_consent_version matches the current notice
-- version in lib/ai/consent.ts — so changing what the notice says (bump the
-- version) re-asks everyone. Revoking consent clears both columns.
--
-- Columns on the existing profiles table, not a new table: no new objects are
-- created, so the existing table-level grants and RLS policies already cover
-- them ("Users can read own profile" / "Users can update own profile" — a user
-- may record or withdraw only their OWN consent; the app writes them with the
-- service role from a server action after checking the session anyway).
-- The explicit GRANTs below are belt-and-braces for Supabase's Oct 30 change
-- (public-schema objects no longer granted to API roles by default); they are
-- no-ops where the table grant already exists. Safe to run twice.
--
-- APPLY MANUALLY in the Supabase SQL editor (migrations are not auto-applied).
-- Numbered 035 to follow open PRs #8 (031), #10 (032), #13 (033), #14 (034).
-- ============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_consent_version text;

COMMENT ON COLUMN public.profiles.ai_consent_at IS
  'When the user agreed to AI processing of their questions (NULL = not agreed / revoked).';
COMMENT ON COLUMN public.profiles.ai_consent_version IS
  'Version of the AI-processing notice the user agreed to (lib/ai/consent.ts AI_CONSENT_VERSION).';

GRANT SELECT (ai_consent_at, ai_consent_version) ON public.profiles TO authenticated;
GRANT UPDATE (ai_consent_at, ai_consent_version) ON public.profiles TO authenticated;
GRANT SELECT (ai_consent_at, ai_consent_version),
      UPDATE (ai_consent_at, ai_consent_version)
  ON public.profiles TO service_role;
