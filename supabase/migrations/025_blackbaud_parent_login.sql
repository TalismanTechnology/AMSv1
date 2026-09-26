-- ============================================
-- 025_blackbaud_parent_login.sql
-- Parents now sign in only through Blackbaud; staff use email/password.
-- Every account is created server-side (service role), so nothing a client
-- sends may choose a role.
--
-- Closes three holes that self-service signup left open:
--   1. handle_new_user() copied `role` from client-supplied signup metadata,
--      so a direct supabase.auth.signUp() could create a super_admin profile.
--   2. "Users can update own profile" let a user rewrite their own role.
--   3. "Users can insert own membership" let a user add themselves to any
--      school as an approved admin.
--
-- Also turn OFF "Allow new users to sign up" in Supabase Auth settings: the
-- app creates accounts with the admin API, which that switch doesn't affect.
-- ============================================

-- 1. New profiles are always parents. Staff roles are granted by a super
--    admin (school_memberships) or set by hand (super_admin).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, approved, child_grade)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    'parent',
    true,
    NULL
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Signed-in users may still edit their own profile, just not its role.
--    Requests with no end user (service role, migrations, the SQL editor) and
--    super admins are exempt.
CREATE OR REPLACE FUNCTION public.guard_profile_role()
RETURNS trigger AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN new;
  END IF;

  IF TG_OP = 'INSERT' AND new.role IS DISTINCT FROM 'parent' THEN
    RAISE EXCEPTION 'profiles.role can only be set by an administrator';
  END IF;

  IF TG_OP = 'UPDATE' AND new.role IS DISTINCT FROM old.role THEN
    RAISE EXCEPTION 'profiles.role can only be changed by an administrator';
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS guard_profile_role ON public.profiles;
CREATE TRIGGER guard_profile_role
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role();

-- 3. Memberships are created only by the server: the Blackbaud callback
--    (parents) and super admins (staff). Admin/super-admin policies remain.
DROP POLICY IF EXISTS "Users can insert own membership" ON public.school_memberships;
