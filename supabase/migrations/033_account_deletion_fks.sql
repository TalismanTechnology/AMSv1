-- ============================================
-- 033_account_deletion_fks.sql
-- Let a user's account be deleted cleanly.
--
-- Deleting the Supabase auth user cascades to public.profiles, but several
-- tables referenced profiles with the default NO ACTION, so the delete
-- failed (analytics_events for every parent who ever asked a question; the
-- "created by" columns for staff). Now:
--   - analytics_events.user_id      ON DELETE CASCADE  (rows hold question
--                                   text, i.e. the user's own words)
--   - "created/reviewed by" columns ON DELETE SET NULL (the school's content
--                                   stays; only the link to the person goes)
-- Tables that were already CASCADE (chat_sessions → chat_messages,
-- chat_feedback, children, notifications, announcement_dismissals,
-- school_memberships, push_devices) or SET NULL (unanswered_questions) are
-- unchanged.
--
-- The app (lib/account/delete-account.ts) also deletes / un-links these rows
-- explicitly, so deletion works even before this runs; these FKs are the
-- database-level guarantee.
--
-- MUST BE APPLIED MANUALLY (Supabase SQL editor / `supabase db push`).
-- Numbered after 031 (PR #8) and 032 (email intake review PR); apply after
-- them. No new tables, views or functions are created, so no new GRANTs are
-- needed; existing grants on these tables are untouched.
-- ============================================

DO $$
DECLARE
  fk record;
  con record;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('analytics_events',         'user_id',     'public.profiles', 'CASCADE'),
      ('documents',                'uploaded_by', 'public.profiles', 'SET NULL'),
      ('events',                   'created_by',  'public.profiles', 'SET NULL'),
      ('announcements',            'created_by',  'public.profiles', 'SET NULL'),
      ('audit_log',                'admin_id',    'public.profiles', 'SET NULL'),
      ('blackbaud_calendar_feeds', 'created_by',  'public.profiles', 'SET NULL'),
      ('blackbaud_events',         'reviewed_by', 'public.profiles', 'SET NULL'),
      ('document_audits',          'created_by',  'auth.users',      'SET NULL')
    ) AS t(tbl, col, ref, action)
  LOOP
    IF to_regclass('public.' || fk.tbl) IS NULL THEN
      RAISE NOTICE 'Skipping %: table does not exist', fk.tbl;
      CONTINUE;
    END IF;

    -- Drop whatever FK currently covers this column (names vary: some were
    -- declared inline, so Postgres named them).
    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'
        AND c.conrelid = ('public.' || fk.tbl)::regclass
        AND a.attname = fk.col
        AND array_length(c.conkey, 1) = 1
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', fk.tbl, con.conname);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(id) ON DELETE %s',
      fk.tbl, fk.tbl || '_' || fk.col || '_fkey', fk.col, fk.ref, fk.action
    );
  END LOOP;
END $$;
