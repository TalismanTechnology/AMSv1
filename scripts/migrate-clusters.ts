/**
 * One-time migration script: backfill existing unanswered questions into
 * persistent clusters. Run after applying migration 016_unanswered_clusters.sql.
 *
 * Usage: npm run migrate:clusters
 */

import { createClient } from "@supabase/supabase-js";
import { clusterQuestions, type ClusterableQuestion } from "@/lib/ai/clustering";
import { labelClusters } from "@/lib/ai/label-clusters";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function computeCentroid(embeddings: number[][]): number[] {
  const dim = embeddings[0].length;
  const centroid = new Array(dim).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) centroid[i] += emb[i];
  }
  for (let i = 0; i < dim; i++) centroid[i] /= embeddings.length;
  return centroid;
}

function computePriorityScore(count: number, lastSeenAt: Date): number {
  const daysSince = Math.max(
    0,
    (Date.now() - lastSeenAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  const recencyBonus = Math.max(0, 10 - Math.floor(daysSince));
  return count * 100 + recencyBonus;
}

async function main() {
  console.log("Fetching all schools...");
  const { data: schools, error: schoolErr } = await supabase
    .from("schools")
    .select("id, name");

  if (schoolErr || !schools) {
    console.error("Failed to fetch schools:", schoolErr);
    process.exit(1);
  }

  for (const school of schools) {
    console.log(`\nProcessing school: ${school.name} (${school.id})`);

    // Fetch unanswered questions without a cluster_id
    const { data: questions, error: qErr } = await supabase
      .from("unanswered_questions")
      .select("id, question, embedding, created_at")
      .eq("school_id", school.id)
      .is("cluster_id", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (qErr) {
      console.error(`  Failed to fetch questions: ${qErr.message}`);
      continue;
    }

    if (!questions || questions.length === 0) {
      console.log("  No orphan questions to migrate.");
      continue;
    }

    console.log(`  Found ${questions.length} orphan questions`);

    // Parse embeddings
    const parsed: ClusterableQuestion[] = questions.map((q) => ({
      id: q.id,
      question: q.question,
      embedding:
        typeof q.embedding === "string"
          ? JSON.parse(q.embedding)
          : q.embedding,
      created_at: q.created_at,
    }));

    // Cluster using existing algorithm
    let clusters = clusterQuestions(parsed);
    console.log(`  Clustered into ${clusters.length} groups`);

    // Label clusters
    try {
      clusters = await labelClusters(clusters);
      console.log("  Labels generated");
    } catch (err) {
      console.error("  Label generation failed, using first question:", err);
      clusters = clusters.map((c) => ({
        ...c,
        label: c.questions[0].question,
      }));
    }

    // Create persistent cluster rows and update questions
    for (const cluster of clusters) {
      const embeddings = cluster.questions.map((q) => q.embedding);
      const centroid = computeCentroid(embeddings);
      const newestDate = new Date(cluster.questions[0].created_at);
      const oldestDate = new Date(
        cluster.questions[cluster.questions.length - 1].created_at
      );

      const { data: newCluster, error: insertErr } = await supabase
        .from("unanswered_clusters")
        .insert({
          school_id: school.id,
          label: cluster.label || cluster.questions[0].question,
          centroid: JSON.stringify(centroid),
          question_count: cluster.questions.length,
          priority_score: computePriorityScore(
            cluster.questions.length,
            newestDate
          ),
          first_seen_at: oldestDate.toISOString(),
          last_seen_at: newestDate.toISOString(),
          // alert_sent_at: null — don't send alerts for historical data
        })
        .select("id")
        .single();

      if (insertErr || !newCluster) {
        console.error(
          `  Failed to create cluster "${cluster.label}": ${insertErr?.message}`
        );
        continue;
      }

      // Update all questions in this cluster
      const questionIds = cluster.questions.map((q) => q.id);
      const { error: updateErr } = await supabase
        .from("unanswered_questions")
        .update({ cluster_id: newCluster.id })
        .in("id", questionIds);

      if (updateErr) {
        console.error(
          `  Failed to assign questions to cluster: ${updateErr.message}`
        );
      } else {
        console.log(
          `  Cluster "${cluster.label}" — ${cluster.questions.length} questions`
        );
      }
    }
  }

  console.log("\nMigration complete!");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
