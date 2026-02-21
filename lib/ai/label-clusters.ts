import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import type { QuestionCluster } from "./clustering";

/**
 * Generate human-friendly topic labels for question clusters.
 * Single LLM call for all clusters to minimize latency/cost.
 * Singletons use the question text directly (no LLM needed).
 */
export async function labelClusters(
  clusters: QuestionCluster[]
): Promise<QuestionCluster[]> {
  const multiClusters = clusters.filter((c) => c.questions.length > 1);

  if (multiClusters.length === 0) {
    return clusters.map((c) => ({
      ...c,
      label: c.questions[0].question,
    }));
  }

  const clusterDescriptions = multiClusters
    .map((c, i) => {
      const qs = c.questions.map((q) => `  - "${q.question}"`).join("\n");
      return `Cluster ${i + 1} (${c.questions.length} questions):\n${qs}`;
    })
    .join("\n\n");

  const { text } = await generateText({
    model: google("gemini-2.0-flash"),
    prompt: `You are labeling groups of similar questions that parents asked a school chatbot. For each cluster below, provide a short topic label (3-8 words) that describes what parents are asking about.

${clusterDescriptions}

Respond with one label per line, in order. Just the labels, no numbering or extra text.`,
    maxOutputTokens: 200,
    temperature: 0.2,
  });

  const labels = text
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let labelIdx = 0;
  return clusters.map((c) => {
    if (c.questions.length > 1 && labelIdx < labels.length) {
      return { ...c, label: labels[labelIdx++] };
    }
    return { ...c, label: c.questions[0].question };
  });
}
