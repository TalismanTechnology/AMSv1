"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import {
  clusterQuestions,
  type ClusterableQuestion,
} from "@/lib/ai/clustering";
import { labelClusters } from "@/lib/ai/label-clusters";

export interface UnansweredQuestionGroup {
  label: string;
  count: number;
  questions: { id: string; question: string; created_at: string }[];
  oldestDate: string;
  newestDate: string;
  priorityScore: number;
  clusterId: string | null;
}

export async function getUnansweredQuestions(
  schoolId: string
): Promise<UnansweredQuestionGroup[]> {
  const supabase = await createClient();

  // 1. Fetch persistent clusters sorted by priority
  const { data: clusters } = await supabase
    .from("unanswered_clusters")
    .select("id, label, question_count, priority_score")
    .eq("school_id", schoolId)
    .order("priority_score", { ascending: false });

  // 2. Fetch all questions (with cluster_id)
  const { data, error } = await supabase
    .from("unanswered_questions")
    .select("id, question, embedding, created_at, cluster_id")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Failed to fetch unanswered questions:", error);
    return [];
  }

  if (!data || data.length === 0) return [];

  const groups: UnansweredQuestionGroup[] = [];

  // 3. Build groups from persistent clusters
  if (clusters && clusters.length > 0) {
    for (const cluster of clusters) {
      const clusterQuestionRows = data.filter(
        (q) => q.cluster_id === cluster.id
      );
      if (clusterQuestionRows.length === 0) continue;

      groups.push({
        label: cluster.label || clusterQuestionRows[0].question,
        count: clusterQuestionRows.length,
        questions: clusterQuestionRows.map((q) => ({
          id: q.id,
          question: q.question,
          created_at: q.created_at,
        })),
        oldestDate:
          clusterQuestionRows[clusterQuestionRows.length - 1].created_at,
        newestDate: clusterQuestionRows[0].created_at,
        priorityScore: cluster.priority_score ?? 0,
        clusterId: cluster.id,
      });
    }
  }

  // 4. Handle orphan questions (no cluster_id) — backward compat
  const orphans = data.filter((q) => !q.cluster_id);
  if (orphans.length > 0) {
    const parsed: ClusterableQuestion[] = orphans.map((row) => ({
      id: row.id,
      question: row.question,
      embedding:
        typeof row.embedding === "string"
          ? JSON.parse(row.embedding)
          : row.embedding,
      created_at: row.created_at,
    }));

    let orphanClusters = clusterQuestions(parsed);

    try {
      orphanClusters = await labelClusters(orphanClusters);
    } catch {
      orphanClusters = orphanClusters.map((c) => ({
        ...c,
        label: c.questions[0].question,
      }));
    }

    for (const cluster of orphanClusters) {
      groups.push({
        label: cluster.label || cluster.questions[0].question,
        count: cluster.questions.length,
        questions: cluster.questions.map((q) => ({
          id: q.id,
          question: q.question,
          created_at: q.created_at,
        })),
        oldestDate:
          cluster.questions[cluster.questions.length - 1].created_at,
        newestDate: cluster.questions[0].created_at,
        priorityScore: cluster.questions.length * 100,
        clusterId: null,
      });
    }
  }

  // 5. Label any persistent clusters that are missing labels
  const unlabeled = groups.filter(
    (g) => g.clusterId && g.label === g.questions[0]?.question && g.count > 1
  );
  if (unlabeled.length > 0) {
    try {
      const toLabel = unlabeled.map((g) => ({
        questions: g.questions.map((q) => ({
          ...q,
          embedding: [] as number[], // not needed for labeling
        })),
      }));
      const labeled = await labelClusters(toLabel);
      for (let i = 0; i < unlabeled.length; i++) {
        if (labeled[i]?.label) {
          unlabeled[i].label = labeled[i].label!;
          // Persist label to DB
          if (unlabeled[i].clusterId) {
            supabase
              .from("unanswered_clusters")
              .update({ label: labeled[i].label })
              .eq("id", unlabeled[i].clusterId!)
              .then(({ error: labelErr }) => {
                if (labelErr)
                  console.error("Failed to persist cluster label:", labelErr);
              });
          }
        }
      }
    } catch {
      // Labels are best-effort
    }
  }

  // Sort by priority score descending
  groups.sort((a, b) => b.priorityScore - a.priorityScore);

  return groups;
}

export async function dismissUnansweredQuestion(questionId: string) {
  const supabase = await createClient();

  // Get the cluster_id before deleting
  const { data: question } = await supabase
    .from("unanswered_questions")
    .select("cluster_id")
    .eq("id", questionId)
    .single();

  const { error } = await supabase
    .from("unanswered_questions")
    .delete()
    .eq("id", questionId);
  if (error) throw new Error("Failed to dismiss question");

  // Update cluster count (or delete if empty)
  if (question?.cluster_id) {
    await updateClusterAfterRemoval(supabase, question.cluster_id);
  }
}

export async function dismissUnansweredCluster(questionIds: string[]) {
  const supabase = await createClient();

  // Get unique cluster IDs before deleting
  const { data: questions } = await supabase
    .from("unanswered_questions")
    .select("cluster_id")
    .in("id", questionIds);

  const clusterIds = [
    ...new Set(
      questions?.map((q) => q.cluster_id).filter(Boolean) as string[]
    ),
  ];

  const { error } = await supabase
    .from("unanswered_questions")
    .delete()
    .in("id", questionIds);
  if (error) throw new Error("Failed to dismiss cluster");

  // Clean up cluster rows
  for (const cid of clusterIds) {
    await updateClusterAfterRemoval(supabase, cid);
  }
}

/** Decrement cluster count or delete if no questions remain. */
async function updateClusterAfterRemoval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clusterId: string
) {
  const { count } = await supabase
    .from("unanswered_questions")
    .select("*", { count: "exact", head: true })
    .eq("cluster_id", clusterId);

  if (count === 0) {
    await supabase.from("unanswered_clusters").delete().eq("id", clusterId);
  } else {
    await supabase
      .from("unanswered_clusters")
      .update({ question_count: count })
      .eq("id", clusterId);
  }
}

/**
 * Answer an unanswered question cluster: creates a document in the "Responses"
 * folder with the admin's answer, triggers processing, and dismisses the cluster.
 */
export async function answerUnansweredCluster(
  schoolId: string,
  label: string,
  answer: string,
  questionIds: string[]
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };
  if (!answer.trim()) return { error: "Answer cannot be empty" };

  // 1. Find or create "Responses" folder
  const { data: existingFolder } = await supabase
    .from("folders")
    .select("id")
    .eq("school_id", schoolId)
    .eq("name", "Responses")
    .is("parent_id", null)
    .single();

  let folderId: string;
  if (existingFolder) {
    folderId = existingFolder.id;
  } else {
    const { data: newFolder, error: folderError } = await supabase
      .from("folders")
      .insert({ name: "Responses", school_id: schoolId, parent_id: null })
      .select("id")
      .single();
    if (folderError || !newFolder) {
      return {
        error: `Failed to create Responses folder: ${folderError?.message}`,
      };
    }
    folderId = newFolder.id;
  }

  // 2. Upload answer as a .txt file to storage
  const timestamp = Date.now();
  const safeTitle = label.replace(/[^a-zA-Z0-9\s-]/g, "").slice(0, 80).trim();
  const storageKey = `${schoolId}/${timestamp}-${safeTitle}.txt`;

  const { data: questionRows } = await supabase
    .from("unanswered_questions")
    .select("question")
    .in("id", questionIds);

  const uniqueQuestions = [
    ...new Set(questionRows?.map((q) => q.question) || [label]),
  ];
  const questionsBlock = uniqueQuestions.map((q) => `Question: ${q}`).join("\n");

  const documentContent = `${questionsBlock}\n\nAnswer: ${answer}`;
  const blob = new Blob([documentContent], { type: "text/plain" });

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storageKey, blob);

  if (uploadError) {
    return { error: `Failed to upload response: ${uploadError.message}` };
  }

  // 3. Create document record
  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      title: label,
      description: `Admin response to unanswered question: "${label}"`,
      file_name: `${safeTitle}.txt`,
      file_type: "txt",
      file_url: storageKey,
      file_size: new Blob([documentContent]).size,
      folder_id: folderId,
      tags: ["response", "auto-generated"],
      status: "processing",
      uploaded_by: user.id,
      school_id: schoolId,
    })
    .select("id")
    .single();

  if (insertError || !doc) {
    return { error: `Failed to create document: ${insertError?.message}` };
  }

  logAudit(
    user.id,
    "answer_unanswered",
    "document",
    doc.id,
    { label, questionCount: questionIds.length },
    schoolId
  );

  // 4. Trigger document processing (chunk + embed)
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");
  const secret = process.env.PROCESS_DOCUMENT_SECRET;

  fetch(`${baseUrl}/api/process-document`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-process-secret": secret } : {}),
    },
    body: JSON.stringify({ documentId: doc.id }),
  }).catch((err) => {
    console.error("[answerUnanswered] Failed to trigger processing:", err);
  });

  // 5. Get cluster IDs and dismiss questions + clusters
  const { data: clusterInfo } = await supabase
    .from("unanswered_questions")
    .select("cluster_id")
    .in("id", questionIds);

  const clusterIds = [
    ...new Set(
      clusterInfo?.map((q) => q.cluster_id).filter(Boolean) as string[]
    ),
  ];

  await supabase.from("unanswered_questions").delete().in("id", questionIds);

  // Delete associated cluster rows
  if (clusterIds.length > 0) {
    for (const cid of clusterIds) {
      await updateClusterAfterRemoval(supabase, cid);
    }
  }

  revalidatePath("/", "layout");
  return { success: true, documentId: doc.id };
}
