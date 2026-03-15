-- Document audit results (AI-generated gap analysis)
CREATE TABLE document_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  gaps JSONB NOT NULL DEFAULT '[]',
  overall_score INTEGER,
  summary TEXT,
  document_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE document_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School admins can view audits"
  ON document_audits FOR SELECT
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

CREATE POLICY "School admins can insert audits"
  ON document_audits FOR INSERT
  WITH CHECK (public.is_school_admin(school_id) OR public.is_super_admin());

CREATE POLICY "School admins can update audits"
  ON document_audits FOR UPDATE
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

CREATE INDEX idx_document_audits_school_date
  ON document_audits(school_id, created_at DESC);
