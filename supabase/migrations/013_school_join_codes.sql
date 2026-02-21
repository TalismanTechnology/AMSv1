-- Migration: School Join Codes & Registration Controls
-- Adds join code system for schools and approval controls

-- 1. Add join_code column to schools
ALTER TABLE public.schools ADD COLUMN join_code text;

-- Unique index on join_code (only for non-null values)
CREATE UNIQUE INDEX idx_schools_join_code ON public.schools(join_code) WHERE join_code IS NOT NULL;

-- 2. Add registration settings
ALTER TABLE public.settings ADD COLUMN require_join_code boolean NOT NULL DEFAULT false;
ALTER TABLE public.settings ADD COLUMN require_approval boolean NOT NULL DEFAULT true;

-- 3. Update is_school_member() to require approved = true
-- This ensures RLS blocks unapproved users from accessing school data
CREATE OR REPLACE FUNCTION public.is_school_member(p_school_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE user_id = auth.uid()
      AND school_id = p_school_id
      AND approved = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
