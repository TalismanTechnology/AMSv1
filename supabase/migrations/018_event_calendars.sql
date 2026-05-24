-- ============================================
-- 018_event_calendars.sql
-- Multiple calendars: tag events with divisions
-- (Lower/Middle/Upper) and categories (Athletics,
-- Arts, ...) so parents can filter the calendar.
-- Admin-managed, school-scoped.
-- ============================================

-- Tag definitions. `kind` separates the two independent
-- filter dimensions: 'division' and 'category'.
CREATE TABLE public.event_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('division', 'category')),
  name text NOT NULL,
  color text NOT NULL DEFAULT 'slate',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (school_id, kind, name)
);

CREATE INDEX idx_event_calendars_school ON public.event_calendars(school_id);

-- Many-to-many: an event can belong to any number of
-- divisions and categories. Having no tag of a given
-- kind means the event is universal for that dimension
-- (e.g. an all-school event with no division).
CREATE TABLE public.event_calendar_links (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  calendar_id uuid NOT NULL REFERENCES public.event_calendars(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, calendar_id)
);

CREATE INDEX idx_event_calendar_links_event ON public.event_calendar_links(event_id);
CREATE INDEX idx_event_calendar_links_calendar ON public.event_calendar_links(calendar_id);

ALTER TABLE public.event_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_calendar_links ENABLE ROW LEVEL SECURITY;

-- event_calendars: members read, admins manage.
CREATE POLICY "School members can read event calendars"
  ON public.event_calendars FOR SELECT
  USING (public.is_school_member(school_id) OR public.is_super_admin());

CREATE POLICY "School admins can manage event calendars"
  ON public.event_calendars FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

-- event_calendar_links: scoped through the parent event's school.
CREATE POLICY "School members can read event calendar links"
  ON public.event_calendar_links FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_calendar_links.event_id
      AND (public.is_school_member(e.school_id) OR public.is_super_admin())
  ));

CREATE POLICY "School admins can manage event calendar links"
  ON public.event_calendar_links FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_calendar_links.event_id
      AND (public.is_school_admin(e.school_id) OR public.is_super_admin())
  ));

-- Seed a sensible starting set for every existing school.
-- Admins can rename, recolor, or delete any of these.
INSERT INTO public.event_calendars (school_id, kind, name, color, sort_order)
SELECT s.id, d.kind, d.name, d.color, d.sort_order
FROM public.schools s
CROSS JOIN (VALUES
  ('division', 'Lower School',  'sky',     0),
  ('division', 'Middle School', 'violet',  1),
  ('division', 'Upper School',  'emerald', 2),
  ('category', 'Athletics',     'orange',  0),
  ('category', 'Arts',          'rose',    1),
  ('category', 'Academics',     'amber',   2)
) AS d(kind, name, color, sort_order)
ON CONFLICT (school_id, kind, name) DO NOTHING;
