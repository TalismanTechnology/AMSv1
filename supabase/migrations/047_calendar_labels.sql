-- ============================================
-- 047_calendar_labels.sql
-- (Applied to production on 2026-10-26 under its working name,
-- 031_calendar_labels.sql.)
-- Calendar labels replace division/category tags on events.
--
-- A label is a name and a color. It can carry one iCal subscription
-- (blackbaud_calendar_feeds.label_id), whose events sync straight onto the
-- calendar under that label, or none, for events admins add by hand.
-- Each event has at most one label, and the label's color is the event's color.
--
-- Additive only: event_calendar_links is left in place, so code already
-- deployed against this database keeps working until the new code ships.
-- ============================================

BEGIN;

-- ── Labels ───────────────────────────────────────────
-- Separate from blackbaud_calendar_feeds because a feed URL is a bearer
-- credential (admins only), while parents need to read label names and colors.
CREATE TABLE IF NOT EXISTS public.calendar_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- A palette name from lib/event-calendars.ts (slate, sky, emerald, ...).
  color text NOT NULL DEFAULT 'slate',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_calendar_labels_school
  ON public.calendar_labels(school_id);

ALTER TABLE public.calendar_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School members can read calendar labels"
  ON public.calendar_labels FOR SELECT
  USING (public.is_school_member(school_id) OR public.is_super_admin());

CREATE POLICY "School admins can manage calendar labels"
  ON public.calendar_labels FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_admin(school_id) OR public.is_super_admin());

-- ── A label's iCal link ──────────────────────────────
-- One feed per label. Deleting the label deletes its feed, which cascades the
-- feed's staged occurrences.
ALTER TABLE public.blackbaud_calendar_feeds
  ADD COLUMN IF NOT EXISTS label_id uuid
    REFERENCES public.calendar_labels(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bb_feeds_label
  ON public.blackbaud_calendar_feeds(label_id)
  WHERE label_id IS NOT NULL;

-- ── An event's label ─────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS label_id uuid
    REFERENCES public.calendar_labels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_label
  ON public.events(label_id)
  WHERE label_id IS NOT NULL;

-- One published row per synced occurrence per day. Syncs now publish without
-- review, so a scheduled sync and an admin's "Sync now" can overlap; without
-- this, both would delete-then-insert and every event would appear twice. With
-- it, the slower insert fails and that sync reports an error instead.
-- Any duplicates already there are cleared first so the index can build.
DELETE FROM public.events e
USING public.events keep
WHERE e.blackbaud_event_id IS NOT NULL
  AND keep.blackbaud_event_id = e.blackbaud_event_id
  AND keep.date = e.date
  AND keep.id < e.id;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_events_blackbaud_day
  ON public.events(blackbaud_event_id, date)
  WHERE blackbaud_event_id IS NOT NULL;

-- A label must belong to the same school as the row pointing at it.
CREATE OR REPLACE FUNCTION public.check_row_label_school()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.label_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.calendar_labels l
    WHERE l.id = NEW.label_id AND l.school_id = NEW.school_id
  ) THEN
    RAISE EXCEPTION 'label must belong to the same school';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_event_label ON public.events;
CREATE TRIGGER trg_check_event_label
  BEFORE INSERT OR UPDATE OF label_id ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.check_row_label_school();

DROP TRIGGER IF EXISTS trg_check_bb_feed_label ON public.blackbaud_calendar_feeds;
CREATE TRIGGER trg_check_bb_feed_label
  BEFORE INSERT OR UPDATE OF label_id ON public.blackbaud_calendar_feeds
  FOR EACH ROW EXECUTE FUNCTION public.check_row_label_school();

-- ── Backfill: every existing feed becomes a label ────
-- Colors cycle through the palette in the order feeds were added.
INSERT INTO public.calendar_labels (school_id, name, color, sort_order)
SELECT
  f.school_id,
  f.label,
  (ARRAY['sky','emerald','amber','violet','rose','teal','orange','slate'])[
    ((row_number() OVER (PARTITION BY f.school_id ORDER BY f.created_at) - 1) % 8) + 1
  ],
  (row_number() OVER (PARTITION BY f.school_id ORDER BY f.created_at) - 1)::integer
FROM public.blackbaud_calendar_feeds f
WHERE f.label_id IS NULL
ON CONFLICT (school_id, name) DO NOTHING;

-- Two feeds sharing a name would share one label, which the unique index
-- forbids, so only the oldest feed of a name is attached; the rest stay
-- unlabeled for an admin to sort out.
UPDATE public.blackbaud_calendar_feeds f
SET label_id = l.id
FROM public.calendar_labels l
WHERE f.label_id IS NULL
  AND l.school_id = f.school_id
  AND l.name = f.label
  AND f.id = (
    SELECT f2.id FROM public.blackbaud_calendar_feeds f2
    WHERE f2.school_id = f.school_id AND f2.label = f.label
    ORDER BY f2.created_at
    LIMIT 1
  );

-- Events already published from a feed take that feed's label.
UPDATE public.events e
SET label_id = f.label_id
FROM public.blackbaud_events b
JOIN public.blackbaud_calendar_feeds f ON f.id = b.feed_id
WHERE e.blackbaud_event_id = b.id
  AND e.label_id IS NULL
  AND f.label_id IS NOT NULL;

COMMIT;
