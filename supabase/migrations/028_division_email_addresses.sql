-- ============================================
-- 028_division_email_addresses.sql
-- One inbound address per division, and documents that know which division
-- they are for.
--
-- A school had a single inbound address (schools.inbound_email_token). Now it
-- can also give each division (Lower / Middle / Upper School — the divisions
-- in event_calendars) its own address. Mail sent to a division's address
-- becomes documents tagged with that division, so the chat knows a letter
-- that came in through the Upper School address is about Upper School.
--
-- schools.inbound_email_token is copied in below as the school's whole-school
-- address (division_id NULL) and is no longer read. It stays only so the
-- previous deploy keeps receiving mail until this one is live; drop it after.
-- ============================================

-- ── Inbound addresses ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_ingestion_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  -- Local part of the address: <token>@<INBOUND_EMAIL_DOMAIN>. Unique, so it
  -- also serves the webhook's lookup.
  token text NOT NULL UNIQUE,
  -- NULL is the whole-school address. Deleting a division retires its address.
  division_id uuid REFERENCES public.event_calendars(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, division_id)
);

-- UNIQUE above treats NULLs as distinct; this keeps one whole-school address.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_ingestion_addresses_whole_school
  ON public.email_ingestion_addresses(school_id)
  WHERE division_id IS NULL;

INSERT INTO public.email_ingestion_addresses (school_id, token)
SELECT id, inbound_email_token
FROM public.schools
WHERE inbound_email_token IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.email_ingestion_addresses ENABLE ROW LEVEL SECURITY;

-- The webhook reads with the service role. Admins manage their own school's
-- addresses, and a division address must point at one of that school's
-- divisions.
CREATE POLICY "School admins can manage email ingestion addresses"
  ON public.email_ingestion_addresses FOR ALL
  USING (public.is_school_admin(school_id) OR public.is_super_admin())
  WITH CHECK (
    (public.is_school_admin(school_id) OR public.is_super_admin())
    AND (
      division_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.event_calendars c
        WHERE c.id = email_ingestion_addresses.division_id
          AND c.school_id = email_ingestion_addresses.school_id
          AND c.kind = 'division'
      )
    )
  );

-- ── Which divisions a document is for ────────────────
-- No rows means the document is for the whole school (or nobody said).
CREATE TABLE IF NOT EXISTS public.document_divisions (
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  division_id uuid NOT NULL REFERENCES public.event_calendars(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, division_id)
);

CREATE INDEX IF NOT EXISTS idx_document_divisions_division
  ON public.document_divisions(division_id);

ALTER TABLE public.document_divisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School members can read document divisions"
  ON public.document_divisions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_divisions.document_id
      AND (public.is_school_member(d.school_id) OR public.is_super_admin())
  ));

CREATE POLICY "School admins can manage document divisions"
  ON public.document_divisions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_divisions.document_id
      AND (public.is_school_admin(d.school_id) OR public.is_super_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.documents d
    JOIN public.event_calendars c ON c.school_id = d.school_id
    WHERE d.id = document_divisions.document_id
      AND c.id = document_divisions.division_id
      AND c.kind = 'division'
      AND (public.is_school_admin(d.school_id) OR public.is_super_admin())
  ));
