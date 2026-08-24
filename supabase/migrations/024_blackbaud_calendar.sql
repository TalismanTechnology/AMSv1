-- ============================================
-- 024_blackbaud_calendar.sql
-- Blackbaud calendar ingestion.
--
-- The SKY School API has no school-calendar events endpoint — Blackbaud never
-- migrated the legacy ON API calendar routes and points integrators at iCal
-- feeds instead. So events arrive over per-school iCal subscriptions, while
-- SKY supplies the *vocabulary* we auto-tag against (/school/v1/levels for
-- divisions, /school/v1/events/categories for categories).
--
-- Synced events land in blackbaud_events for admin review; nothing reaches
-- public.events until an admin approves it.
-- ============================================

-- ── Per-school iCal feeds ────────────────────────────
-- A school publishes one feed per calendar (Upper School Athletics, All School,
-- Arts, ...). The feed's own name is usually the single best tag signal, which
-- is why mappings below can key off the feed id.
CREATE TABLE IF NOT EXISTS public.blackbaud_calendar_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,

  -- iCal DTSTART values may be "floating" (no TZID, not UTC). RFC 5545 says
  -- those resolve in the *viewer's* local zone, which on a server is UTC and
  -- would shift a 3pm game onto the wrong day. Resolve them here instead.
  timezone text NOT NULL DEFAULT 'America/New_York',

  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_error text,

  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (school_id, url)
);

CREATE INDEX IF NOT EXISTS idx_bb_feeds_school
  ON public.blackbaud_calendar_feeds(school_id) WHERE is_active;

-- ── Tag mappings ─────────────────────────────────────
-- Maps a source value onto one of the school's own event_calendars rows.
-- 'feed' keys on a feed id; the rest key on a normalized name coming from the
-- iCal CATEGORIES property or from SKY.
--
-- Rows are written two ways: seeded when an admin configures a feed, and
-- learned when an admin corrects a suggestion in the review queue. The second
-- path is what makes the tagging get better over a season instead of asking
-- the model the same question every night.
CREATE TABLE IF NOT EXISTS public.blackbaud_calendar_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  source_kind text NOT NULL
    CHECK (source_kind IN ('feed', 'ical_category', 'sky_category', 'sky_level')),
  source_value text NOT NULL,
  calendar_id uuid NOT NULL REFERENCES public.event_calendars(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (school_id, source_kind, source_value, calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_bb_mappings_lookup
  ON public.blackbaud_calendar_mappings(school_id, source_kind, source_value);

-- ── Staged events awaiting review ────────────────────
-- One row per *occurrence*: a weekly practice expands to one row per week, so
-- an admin can reject a single cancelled session without dropping the series.
CREATE TABLE IF NOT EXISTS public.blackbaud_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  feed_id uuid NOT NULL REFERENCES public.blackbaud_calendar_feeds(id) ON DELETE CASCADE,

  external_uid text NOT NULL,
  -- Instance start in UTC. Together with the UID this identifies one
  -- occurrence across syncs even when the series is edited upstream.
  occurrence_start timestamptz NOT NULL,

  title text NOT NULL,
  description text,
  location text,
  all_day boolean NOT NULL DEFAULT false,

  -- Denormalized into the shape public.events actually stores, resolved in the
  -- feed's timezone at parse time. Approval is then a straight copy with no
  -- timezone maths left to get wrong.
  local_date date NOT NULL,
  local_end_date date,
  local_start_time time,
  local_end_time time,

  raw_categories text[] NOT NULL DEFAULT '{}',

  -- ── Auto-tagging output ──
  suggested_event_type text NOT NULL DEFAULT 'general'
    CHECK (suggested_event_type IN
      ('general','academic','sports','arts','meeting','holiday','other')),
  -- 'mapping' = matched a blackbaud_calendar_mappings row (deterministic).
  -- 'ai'      = fell through to the model.
  -- 'none'    = neither produced a tag; admin must decide.
  tag_source text NOT NULL DEFAULT 'none'
    CHECK (tag_source IN ('none', 'mapping', 'ai')),
  tag_confidence real,

  -- Hash of the upstream fields. An unchanged event re-appearing on tonight's
  -- sync must not resurrect a row an admin already rejected, and must not
  -- reset an approved row back to pending.
  content_hash text NOT NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),

  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (school_id, feed_id, external_uid, occurrence_start)
);

CREATE INDEX IF NOT EXISTS idx_bb_events_review
  ON public.blackbaud_events(school_id, status, local_date);

CREATE INDEX IF NOT EXISTS idx_bb_events_feed
  ON public.blackbaud_events(feed_id);

-- Suggested division/category tags for a staged event. Mirrors
-- event_calendar_links so approval copies straight across.
CREATE TABLE IF NOT EXISTS public.blackbaud_event_calendar_suggestions (
  blackbaud_event_id uuid NOT NULL
    REFERENCES public.blackbaud_events(id) ON DELETE CASCADE,
  calendar_id uuid NOT NULL
    REFERENCES public.event_calendars(id) ON DELETE CASCADE,
  PRIMARY KEY (blackbaud_event_id, calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_bb_event_suggestions_calendar
  ON public.blackbaud_event_calendar_suggestions(calendar_id);

-- ── Provenance on published events ───────────────────
-- Lets the events UI mark a row as Blackbaud-sourced.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'import', 'blackbaud'));

-- Points back at the staged occurrence that produced this event. The link runs
-- this way because approval is one-to-many: public.events stores a row per day,
-- so a week-long break becomes several rows from a single staged occurrence.
-- Re-approving after an upstream edit deletes by this column and re-inserts,
-- which cannot leave orphaned days behind the way a single forward id could.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS blackbaud_event_id uuid
    REFERENCES public.blackbaud_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_blackbaud_source
  ON public.events(blackbaud_event_id) WHERE blackbaud_event_id IS NOT NULL;

-- ============================================
-- RLS
-- ============================================
ALTER TABLE public.blackbaud_calendar_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blackbaud_calendar_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blackbaud_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blackbaud_event_calendar_suggestions ENABLE ROW LEVEL SECURITY;

-- Feed rows carry a subscription URL that is a bearer credential for the
-- school's calendar: anyone holding it can read the feed. Admins only, and
-- never exposed to parents.
CREATE POLICY "School admins can manage calendar feeds"
  ON public.blackbaud_calendar_feeds FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_admin(school_id) OR public.is_super_admin());

CREATE POLICY "School admins can manage calendar mappings"
  ON public.blackbaud_calendar_mappings FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_admin(school_id) OR public.is_super_admin());

-- Staged events are unreviewed third-party content. Parents see them only
-- after approval, at which point they live in public.events.
CREATE POLICY "School admins can manage staged Blackbaud events"
  ON public.blackbaud_events FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin())
  WITH CHECK (public.is_school_admin(school_id) OR public.is_super_admin());

CREATE POLICY "School admins can manage staged event suggestions"
  ON public.blackbaud_event_calendar_suggestions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.blackbaud_events be
    WHERE be.id = blackbaud_event_calendar_suggestions.blackbaud_event_id
      AND (public.is_school_admin(be.school_id) OR public.is_super_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.blackbaud_events be
    WHERE be.id = blackbaud_event_calendar_suggestions.blackbaud_event_id
      AND (public.is_school_admin(be.school_id) OR public.is_super_admin())
  ));
