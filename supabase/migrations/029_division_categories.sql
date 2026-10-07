-- ============================================
-- 029_division_categories.sql
-- Categories grouped by division.
--
-- A category now belongs to one division (Lower / Middle / Upper School, the
-- divisions in event_calendars) or, with division_id NULL, to the whole
-- school. Each group carries the same short list of categories, so a name
-- like "Academics" repeats across groups and is unique only within one.
--
-- A document's division follows its category. Admins switch a school over
-- from Documents -> Manage Categories; existing categories are left alone
-- here.
-- ============================================

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS division_id uuid
    REFERENCES public.event_calendars(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- The whole school has no division id. Give it a fixed key so a single
-- unique constraint covers every group, and ON CONFLICT can target it.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS division_scope uuid GENERATED ALWAYS AS (
    COALESCE(division_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) STORED;

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_name_school_unique;

DO $$
BEGIN
  ALTER TABLE public.categories
    ADD CONSTRAINT categories_name_group_unique
      UNIQUE (school_id, division_scope, name);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_categories_division
  ON public.categories(division_id);

-- A category's division must be one of the same school's divisions.
DROP POLICY IF EXISTS "School admins can manage categories" ON public.categories;

CREATE POLICY "School admins can manage categories"
  ON public.categories FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin())
  WITH CHECK (
    (public.is_school_admin(school_id) OR public.is_super_admin())
    AND (
      division_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.event_calendars c
        WHERE c.id = categories.division_id
          AND c.school_id = categories.school_id
          AND c.kind = 'division'
      )
    )
  );
