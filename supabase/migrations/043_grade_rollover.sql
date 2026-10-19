-- ============================================
-- 043_grade_rollover.sql
-- Children's grades move up automatically every school year.
--
-- Each child is anchored to a graduating class (children.class_year: the
-- calendar year they finish 12th grade). children.grade stays the column every
-- reader uses; it becomes a cache of "the grade this class is in now", kept
-- fresh by the roll-grades cron (app/api/cron/roll-grades). docs/GRADE_ROLLOVER.md
-- has the full picture.
--
-- 1. settings.grade_rollover_month / _day: the date grades move up
--    (Admin > Settings > General). Missing settings row = July 1.
-- 2. children.class_year / graduated_at.
-- 3. grade_index / grade_from_index / school_year_start helpers.
-- 4. children_anchor_class_year trigger: any write that sets a grade (parent
--    profile, welcome form, Veracross sign-in) re-anchors the class year, so
--    the most recent grade written wins.
-- 5. roll_children_grades(): what the daily cron calls. 12th graders past
--    their year are marked graduated, never deleted.
-- 6. Backfill: every existing child with a recognised grade is anchored to
--    the current school year. No grade value changes.
--
-- Formula (lib/grades.ts mirrors it; school year 2026-27 has start 2026):
--   class_year    = school_year_start + 1 + (12 - grade_index)
--   current index = 12 - (class_year - (school_year_start + 1))
-- Worked examples (lib/grades.test.ts checks the TS mirror against these):
--   grade 8 in school year starting 2026 -> class_year 2031
--   grade K in school year starting 2026 -> class_year 2039
--   grade Pre-K in school year starting 2026 -> class_year 2040
--   grade 12 in school year starting 2026 -> class_year 2027
--   class_year 2031 in school year starting 2027 -> grade 9
--   class_year 2039 in school year starting 2027 -> grade 1
--   class_year 2027 in school year starting 2027 -> graduated
--
-- MUST BE APPLIED MANUALLY (Supabase SQL editor / `supabase db push`).
-- Additive and idempotent. Safe to deploy the code first: the app falls back
-- to July 1 and "not graduated" while the columns are missing, and the cron
-- reports the missing function as an error.
-- ============================================

BEGIN;

-- ── 1. School setting ─────────────────────────────────────────────
-- The app only offers dates that exist in every year (no Feb 29);
-- school_year_start clamps anything else to the month's last day.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS grade_rollover_month smallint NOT NULL DEFAULT 7
    CHECK (grade_rollover_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS grade_rollover_day smallint NOT NULL DEFAULT 1
    CHECK (grade_rollover_day BETWEEN 1 AND 31);

COMMENT ON COLUMN public.settings.grade_rollover_month IS
  'Month (1-12) on which children''s grades move up each year (migration 043).';
COMMENT ON COLUMN public.settings.grade_rollover_day IS
  'Day of month on which children''s grades move up each year (migration 043).';

-- ── 2. Children ───────────────────────────────────────────────────
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS class_year integer,
  ADD COLUMN IF NOT EXISTS graduated_at timestamptz;

COMMENT ON COLUMN public.children.class_year IS
  'Graduating class: the calendar year the child finishes 12th grade. Set by the children_anchor_class_year trigger whenever grade is written; NULL for grades the app does not recognise (those never roll).';
COMMENT ON COLUMN public.children.graduated_at IS
  'When roll_children_grades found the child past 12th grade. Graduated children are kept (grade stays 12) but left out of the assistant''s context.';

-- ── 3. Helpers ────────────────────────────────────────────────────
-- Pre-K = -1, K = 0, '1'..'12' = 1..12; anything else (legacy free text) NULL.
CREATE OR REPLACE FUNCTION public.grade_index(p_grade text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT array_position(
    ARRAY['Pre-K', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    p_grade
  ) - 2
$$;

-- Inverse of grade_index; NULL outside -1..12.
CREATE OR REPLACE FUNCTION public.grade_from_index(p_index integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT (ARRAY['Pre-K', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'])[p_index + 2]
$$;

-- The calendar year the school's current school year started in, judged by
-- the local date in America/New_York against the school's rollover date
-- (July 1 if unset). A rollover day the month doesn't have is clamped to the
-- month's last day.
CREATE OR REPLACE FUNCTION public.school_year_start(
  p_school_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local date := (p_at AT TIME ZONE 'America/New_York')::date;
  v_year integer := extract(year FROM v_local)::integer;
  v_month integer;
  v_day integer;
  v_month_start date;
  v_rollover date;
BEGIN
  SELECT s.grade_rollover_month, s.grade_rollover_day
    INTO v_month, v_day
    FROM public.settings s
   WHERE s.school_id = p_school_id;

  -- No row leaves both NULL.
  v_month := coalesce(v_month, 7);
  v_day := coalesce(v_day, 1);

  v_month_start := make_date(v_year, v_month, 1);
  v_rollover := v_month_start + (
    least(v_day, extract(day FROM (v_month_start + interval '1 month' - interval '1 day'))::integer) - 1
  );

  RETURN CASE WHEN v_local >= v_rollover THEN v_year ELSE v_year - 1 END;
END;
$$;

-- ── 4. Anchor trigger ─────────────────────────────────────────────
-- Runs on insert and whenever grade or school_id is written. An update that
-- re-sends the same grade and school (e.g. a rename, or a Veracross sign-in
-- with no grade change) leaves the anchor alone.
CREATE OR REPLACE FUNCTION public.children_anchor_class_year()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_index integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.grade IS NOT DISTINCT FROM OLD.grade
       AND NEW.school_id IS NOT DISTINCT FROM OLD.school_id THEN
      RETURN NEW;
    END IF;
  END IF;

  v_index := public.grade_index(NEW.grade);
  NEW.class_year := CASE
    WHEN v_index IS NULL THEN NULL
    ELSE public.school_year_start(NEW.school_id) + 1 + (12 - v_index)
  END;
  NEW.graduated_at := NULL;
  RETURN NEW;
END;
$$;

-- ── 5. Daily roll ─────────────────────────────────────────────────
-- Returns how many children changed. Idempotent: a second run the same day
-- changes nothing.
CREATE OR REPLACE FUNCTION public.roll_children_grades()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_regraded integer;
  v_graduated integer;
BEGIN
  -- Children still at school (Pre-K..12) whose cached grade is out of date,
  -- or who were marked graduated but aren't past 12th any more (the rollover
  -- date moved later). Writing grade fires the anchor trigger, which
  -- recomputes the same class_year and clears graduated_at.
  WITH years AS (
    SELECT s.school_id, public.school_year_start(s.school_id) AS start_year
      FROM (SELECT DISTINCT school_id FROM public.children WHERE class_year IS NOT NULL) s
  ), current_grades AS (
    SELECT c.id, 12 - (c.class_year - (y.start_year + 1)) AS idx
      FROM public.children c
      JOIN years y ON y.school_id = c.school_id
     WHERE c.class_year IS NOT NULL
  )
  UPDATE public.children c
     SET grade = public.grade_from_index(g.idx),
         graduated_at = NULL
    FROM current_grades g
   WHERE c.id = g.id
     AND g.idx BETWEEN -1 AND 12
     AND (c.grade IS DISTINCT FROM public.grade_from_index(g.idx) OR c.graduated_at IS NOT NULL);
  GET DIAGNOSTICS v_regraded = ROW_COUNT;

  -- Past 12th grade: mark graduated, keep the row and its grade ('12').
  -- grade isn't written here, so the anchor trigger doesn't fire.
  WITH years AS (
    SELECT s.school_id, public.school_year_start(s.school_id) AS start_year
      FROM (SELECT DISTINCT school_id FROM public.children WHERE class_year IS NOT NULL) s
  )
  UPDATE public.children c
     SET graduated_at = now()
    FROM years y
   WHERE y.school_id = c.school_id
     AND c.class_year IS NOT NULL
     AND c.graduated_at IS NULL
     AND 12 - (c.class_year - (y.start_year + 1)) > 12;
  GET DIAGNOSTICS v_graduated = ROW_COUNT;

  -- An index below -1 (younger than Pre-K, only possible if the rollover date
  -- moved) is left alone until it comes back into range.
  RETURN v_regraded + v_graduated;
END;
$$;

-- ── 6. Backfill ───────────────────────────────────────────────────
-- Anchor existing children to the current school year (2026-27 when this
-- was written) so each one keeps exactly the grade it shows today. Only
-- class_year is written, and before the trigger exists.
WITH years AS (
  SELECT s.school_id, public.school_year_start(s.school_id) AS start_year
    FROM (SELECT DISTINCT school_id FROM public.children) s
)
UPDATE public.children c
   SET class_year = y.start_year + 1 + (12 - public.grade_index(c.grade))
  FROM years y
 WHERE y.school_id = c.school_id
   AND c.class_year IS NULL
   AND public.grade_index(c.grade) IS NOT NULL;

DROP TRIGGER IF EXISTS children_anchor_class_year ON public.children;
CREATE TRIGGER children_anchor_class_year
  BEFORE INSERT OR UPDATE OF grade, school_id ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.children_anchor_class_year();

-- ── 7. Explicit grants ────────────────────────────────────────────
-- Supabase no longer grants new objects to the API roles implicitly. Nothing
-- here is called from a browser: the trigger function needs no EXECUTE grant
-- (see 039), and the roll runs from the cron with the service role.
REVOKE EXECUTE ON FUNCTION public.grade_index(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grade_from_index(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.school_year_start(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.children_anchor_class_year() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.roll_children_grades() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grade_index(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grade_from_index(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.school_year_start(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.roll_children_grades() TO service_role;
-- (children and settings are existing tables whose grants are unchanged;
-- new columns inherit the table-level grants.)

COMMIT;
