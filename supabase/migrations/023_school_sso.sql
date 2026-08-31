-- ============================================
-- 023_school_sso.sql
-- Per-school single sign-on.
--
-- Each school points AskMySchool at the same identity provider that backs their
-- Blackbaud site (Azure AD, Google Workspace, or any SAML 2.0 IdP), so parents
-- sign in with the credentials they already use for the school website.
--
-- IMPORTANT: these columns record WHICH registered Supabase SSO provider a
-- school routes to; they do not create one. Registration happens either via
-- CLI (`supabase sso add --type saml --domains <domain>`) or the service-role
-- admin endpoint (POST /auth/v1/admin/sso/providers), whose availability on a
-- hosted project is plan-dependent and unverified here.
-- ============================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS sso_enabled boolean NOT NULL DEFAULT false,
  -- Email domain handed to signInWithSSO({ domain }). Must match a --domains
  -- value on the registered Supabase SSO provider.
  ADD COLUMN IF NOT EXISTS sso_domain text,
  -- Alternative to sso_domain: the provider UUID from `supabase sso list`.
  -- Used when a school's IdP has no domain claim of its own.
  ADD COLUMN IF NOT EXISTS sso_provider_id uuid,
  -- Button copy, e.g. "Continue with Lincoln High" or "Sign in with Microsoft".
  ADD COLUMN IF NOT EXISTS sso_button_label text;

-- Enabling SSO without a route to a provider would render a button that always
-- fails. Require exactly one of the two routing keys whenever it is on.
ALTER TABLE public.schools
  DROP CONSTRAINT IF EXISTS schools_sso_route_required;

ALTER TABLE public.schools
  ADD CONSTRAINT schools_sso_route_required CHECK (
    NOT sso_enabled
    OR sso_domain IS NOT NULL
    OR sso_provider_id IS NOT NULL
  );

-- A domain can only route to one school; otherwise a parent typing their email
-- could be landed in the wrong tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_sso_domain
  ON public.schools(lower(sso_domain))
  WHERE sso_domain IS NOT NULL;
