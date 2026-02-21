import { SupabaseClient } from "@supabase/supabase-js";

const SIMILARITY_THRESHOLD = 0.82;
const ALERT_THRESHOLD = 5;

/**
 * Compute a priority score (volume-first with recency tiebreaker).
 * score = question_count * 100 + recencyBonus (0-10)
 */
function computePriorityScore(questionCount: number, lastSeenAt: Date): number {
  const daysSince = Math.max(
    0,
    (Date.now() - lastSeenAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  const recencyBonus = Math.max(0, 10 - Math.floor(daysSince));
  return questionCount * 100 + recencyBonus;
}

/**
 * Compute running-average centroid update.
 * new_centroid[i] = (old_centroid[i] * (count - 1) + new_embedding[i]) / count
 */
function updateCentroid(
  oldCentroid: number[],
  newEmbedding: number[],
  newCount: number
): number[] {
  const dim = oldCentroid.length;
  const result = new Array(dim);
  for (let i = 0; i < dim; i++) {
    result[i] =
      (oldCentroid[i] * (newCount - 1) + newEmbedding[i]) / newCount;
  }
  return result;
}

/**
 * Assign an unanswered question to a persistent cluster.
 * Creates a new cluster if no existing cluster matches.
 * Returns whether the cluster just crossed the alert threshold.
 */
export async function assignToCluster(
  adminSupabase: SupabaseClient,
  questionId: string,
  embedding: number[],
  schoolId: string
): Promise<{ clusterId: string; crossedThreshold: boolean }> {
  // 1. Find nearest cluster via pgvector RPC
  const { data: matches, error: rpcError } = await adminSupabase.rpc(
    "match_nearest_cluster",
    {
      query_embedding: JSON.stringify(embedding),
      p_school_id: schoolId,
      similarity_threshold: SIMILARITY_THRESHOLD,
    }
  );

  if (rpcError) {
    throw new Error(`match_nearest_cluster RPC failed: ${rpcError.message}`);
  }

  const match = matches?.[0];
  let clusterId: string;
  let crossedThreshold = false;

  if (match) {
    // 2a. Existing cluster found — update it
    const oldCount = match.question_count;
    const newCount = oldCount + 1;
    const oldCentroid: number[] =
      typeof match.centroid === "string"
        ? JSON.parse(match.centroid)
        : match.centroid;
    const newCentroid = updateCentroid(oldCentroid, embedding, newCount);
    const now = new Date();
    const priorityScore = computePriorityScore(newCount, now);

    const { error: updateError } = await adminSupabase
      .from("unanswered_clusters")
      .update({
        centroid: JSON.stringify(newCentroid),
        question_count: newCount,
        priority_score: priorityScore,
        last_seen_at: now.toISOString(),
      })
      .eq("id", match.id);

    if (updateError) {
      throw new Error(`Failed to update cluster: ${updateError.message}`);
    }

    clusterId = match.id;
    crossedThreshold =
      oldCount < ALERT_THRESHOLD &&
      newCount >= ALERT_THRESHOLD &&
      match.alert_sent_at === null;
  } else {
    // 2b. No match — create new cluster
    const { data: newCluster, error: insertError } = await adminSupabase
      .from("unanswered_clusters")
      .insert({
        school_id: schoolId,
        centroid: JSON.stringify(embedding),
        question_count: 1,
        priority_score: computePriorityScore(1, new Date()),
      })
      .select("id")
      .single();

    if (insertError || !newCluster) {
      throw new Error(
        `Failed to create cluster: ${insertError?.message}`
      );
    }

    clusterId = newCluster.id;
  }

  // 3. Link question to cluster
  await adminSupabase
    .from("unanswered_questions")
    .update({ cluster_id: clusterId })
    .eq("id", questionId);

  return { clusterId, crossedThreshold };
}
