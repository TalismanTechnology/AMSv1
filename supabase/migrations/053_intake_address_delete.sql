-- ============================================
-- 053_intake_address_delete.sql
-- Deleting intake addresses without touching what they brought in, and
-- knowing which address each email came in through.
--
-- Admin → Email intake can now delete mailing-list and division addresses
-- (the whole-school address stays: it can only be switched off). Deleting is
-- a soft delete: the row keeps its token and its slot in the unique indexes,
-- is marked deleted_at / deleted_by and switched off, and mail to it is
-- turned away. Documents it already brought in are never changed: they keep
-- their own visible_grades, folder and divisions.
--
-- email_ingestions.intake_address_ids records the addresses that took each
-- message, so the delete dialog can say how many documents an address
-- brought in.
--
-- MUST BE APPLIED MANUALLY (Supabase SQL editor / `supabase db push`)
-- BEFORE the code that uses it deploys. Additive, idempotent and safe for
-- the code that is running now:
--   - every new column is nullable; NULL deleted_at = not deleted, which is
--     every existing address, and the running code never reads or writes
--     the new columns;
--   - the new check (a deleted address is switched off) holds for every
--     existing row, as none is deleted;
--   - the backfill only fills intake_address_ids where it is still NULL.
-- ============================================

-- ── 1. Soft-deleted addresses ────────────────────────
ALTER TABLE public.email_ingestion_addresses
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Belt and braces: a deleted address is always switched off, so any path
-- that ignores deleted_at still turns its mail away, and it can't be
-- switched back on.
DO $$
BEGIN
  ALTER TABLE public.email_ingestion_addresses
    ADD CONSTRAINT email_ingestion_addresses_deleted_off_check CHECK (
      deleted_at IS NULL OR enabled = false
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ── 2. Which addresses took each email ───────────────
-- The ids of the addresses that took the message (applyAddressRules). No
-- foreign key: deleted addresses keep their rows anyway, and the log
-- should outlive any address.
ALTER TABLE public.email_ingestions
  ADD COLUMN IF NOT EXISTS intake_address_ids uuid[];

CREATE INDEX IF NOT EXISTS idx_email_ingestions_intake_address_ids
  ON public.email_ingestions USING GIN (intake_address_ids)
  WHERE intake_address_ids IS NOT NULL;

-- Backfill what can be known honestly. An ingestion's division_ids were
-- only ever set from the division addresses it reached (and only on mail
-- held for review, from migration 032 until PR #51 removed the hold), so
-- those rows get their division addresses. Nothing is guessed for the
-- whole-school or mailing-list addresses: no past row says it came in
-- through one, so their counts start with mail that arrives once this code
-- is live (the admin UI says "documents recorded as coming in through this
-- address"). Division mail that wasn't held isn't recorded either.
UPDATE public.email_ingestions e
SET intake_address_ids = found.ids
FROM (
  SELECT i.id, array_agg(DISTINCT a.id) AS ids
  FROM public.email_ingestions i
  JOIN public.email_ingestion_addresses a
    ON a.school_id = i.school_id
   AND a.kind = 'division'
   AND a.division_id = ANY (i.division_ids)
  WHERE i.intake_address_ids IS NULL
    AND cardinality(i.division_ids) > 0
  GROUP BY i.id
) found
WHERE e.id = found.id
  AND e.intake_address_ids IS NULL;

NOTIFY pgrst, 'reload schema';
