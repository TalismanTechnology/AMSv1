-- ============================================
-- 016_unanswered_clusters.sql
-- Persistent clusters for unanswered questions
-- with priority scoring and alert tracking
-- ============================================

-- Persistent cluster table
CREATE TABLE public.unanswered_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  label text,
  centroid vector(768),
  question_count int DEFAULT 1,
  priority_score float DEFAULT 100,
  alert_sent_at timestamptz,        -- NULL = not yet alerted
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now()
);

-- Add cluster_id FK to existing unanswered_questions
ALTER TABLE public.unanswered_questions
  ADD COLUMN cluster_id uuid REFERENCES public.unanswered_clusters(id) ON DELETE SET NULL;

-- Add 'cluster_alert' to notifications type constraint
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('announcement', 'approval', 'system', 'cluster_alert'));

-- RPC: find nearest cluster by cosine similarity
-- Returns the single closest cluster centroid. App code checks threshold.
CREATE OR REPLACE FUNCTION match_nearest_cluster(
  query_embedding vector(768),
  p_school_id uuid,
  similarity_threshold float DEFAULT 0.82
) RETURNS TABLE(
  id uuid,
  centroid vector(768),
  question_count int,
  alert_sent_at timestamptz
)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.centroid, c.question_count, c.alert_sent_at
  FROM public.unanswered_clusters c
  WHERE c.school_id = p_school_id
    AND (1 - (c.centroid <=> query_embedding)) >= similarity_threshold
  ORDER BY c.centroid <=> query_embedding ASC
  LIMIT 1;
$$;

-- Indexes
CREATE INDEX idx_unanswered_clusters_school ON public.unanswered_clusters(school_id);
CREATE INDEX idx_unanswered_questions_cluster ON public.unanswered_questions(cluster_id);

-- RLS
ALTER TABLE public.unanswered_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School admins can view clusters"
  ON public.unanswered_clusters FOR SELECT
  USING (public.is_school_admin(school_id) OR public.is_super_admin());

CREATE POLICY "School admins can delete clusters"
  ON public.unanswered_clusters FOR DELETE
  USING (public.is_school_admin(school_id) OR public.is_super_admin());
