-- ============================================
-- 030_five_division_categories.sql
-- Seven starter categories per group become five.
--
-- In every group (a division, or the whole school) set up from the starter
-- list, two pairs of categories merge:
--   Athletics + Arts & Activities  ->  Athletics & Activities
--   Policies & Forms + Health & Safety  ->  Policies, Health & Forms
-- Documents move with their category, so nothing is left unfiled and no
-- re-sort is needed. Academics, Events & Calendar and Other are untouched.
--
-- Only groups holding both "Events & Calendar" and "Other" are changed, so a
-- school's own hand-made categories are left alone. Safe to run twice.
-- ============================================

DO $$
DECLARE
  merge record;
  grp record;
  target uuid;
BEGIN
  FOR merge IN
    SELECT * FROM (VALUES
      ('Athletics & Activities', ARRAY['Athletics', 'Arts & Activities'], '#f97316',
       'Sports teams, tryouts, practices and game schedules, music, theater, visual arts, clubs and after-school programs.'),
      ('Policies, Health & Forms', ARRAY['Policies & Forms', 'Health & Safety'], '#ef4444',
       'Handbooks, rules, dress code, attendance, tuition and fees, enrollment, the nurse, medications, allergies, immunizations, safety, and forms to fill in.')
    ) AS m(new_name, old_names, color, description)
  LOOP
    FOR grp IN
      SELECT c.school_id, c.division_scope
      FROM public.categories c
      WHERE c.name = ANY (merge.old_names)
        AND EXISTS (
          SELECT 1 FROM public.categories e
          WHERE e.school_id = c.school_id AND e.division_scope = c.division_scope
            AND e.name = 'Events & Calendar')
        AND EXISTS (
          SELECT 1 FROM public.categories o
          WHERE o.school_id = c.school_id AND o.division_scope = c.division_scope
            AND o.name = 'Other')
      GROUP BY c.school_id, c.division_scope
    LOOP
      -- Merge into the new name if the group already has it, otherwise into
      -- the first old category found, renamed.
      SELECT id INTO target
      FROM public.categories
      WHERE school_id = grp.school_id AND division_scope = grp.division_scope
        AND (name = merge.new_name OR name = ANY (merge.old_names))
      ORDER BY (name = merge.new_name) DESC,
               array_position(merge.old_names, name)
      LIMIT 1;

      UPDATE public.documents d
      SET category_id = target
      FROM public.categories c
      WHERE d.category_id = c.id
        AND c.id <> target
        AND c.school_id = grp.school_id AND c.division_scope = grp.division_scope
        AND c.name = ANY (merge.old_names);

      DELETE FROM public.categories
      WHERE id <> target
        AND school_id = grp.school_id AND division_scope = grp.division_scope
        AND name = ANY (merge.old_names);

      UPDATE public.categories
      SET name = merge.new_name, color = merge.color, description = merge.description
      WHERE id = target;
    END LOOP;
  END LOOP;

  -- Put the five in starter order wherever they now stand together.
  UPDATE public.categories c
  SET sort_order = o.position
  FROM (VALUES
    ('Academics', 0),
    ('Athletics & Activities', 1),
    ('Events & Calendar', 2),
    ('Policies, Health & Forms', 3),
    ('Other', 4)
  ) AS o(name, position)
  WHERE c.name = o.name
    AND EXISTS (
      SELECT 1 FROM public.categories e
      WHERE e.school_id = c.school_id AND e.division_scope = c.division_scope
        AND e.name = 'Events & Calendar')
    AND EXISTS (
      SELECT 1 FROM public.categories x
      WHERE x.school_id = c.school_id AND x.division_scope = c.division_scope
        AND x.name = 'Other');
END $$;
