export interface ClusterableQuestion {
  id: string;
  question: string;
  embedding: number[];
  created_at: string;
}

export interface QuestionCluster {
  questions: ClusterableQuestion[];
  label?: string;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Cluster questions by embedding similarity using agglomerative clustering.
 * At N<200 the O(N²) pairwise comparison is <1ms for 768-dim vectors.
 */
export function clusterQuestions(
  questions: ClusterableQuestion[],
  similarityThreshold = 0.82
): QuestionCluster[] {
  if (questions.length === 0) return [];
  if (questions.length === 1) return [{ questions }];

  const n = questions.length;

  // Pre-compute pairwise similarity
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = cosineSimilarity(questions[i].embedding, questions[j].embedding);
      sim[i][j] = s;
      sim[j][i] = s;
    }
  }

  // Each question starts in its own cluster
  const assignment = questions.map((_, i) => i);

  // Merge loop: find most-similar pair across distinct clusters
  let changed = true;
  while (changed) {
    changed = false;
    let bestSim = -1;
    let bestI = -1;
    let bestJ = -1;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (assignment[i] === assignment[j]) continue;
        if (sim[i][j] > bestSim) {
          bestSim = sim[i][j];
          bestI = i;
          bestJ = j;
        }
      }
    }

    if (bestSim >= similarityThreshold && bestI >= 0 && bestJ >= 0) {
      const target = assignment[bestI];
      const source = assignment[bestJ];
      for (let k = 0; k < n; k++) {
        if (assignment[k] === source) assignment[k] = target;
      }
      changed = true;
    }
  }

  // Build clusters from assignments
  const clusterMap = new Map<number, ClusterableQuestion[]>();
  for (let i = 0; i < n; i++) {
    const cid = assignment[i];
    if (!clusterMap.has(cid)) clusterMap.set(cid, []);
    clusterMap.get(cid)!.push(questions[i]);
  }

  return Array.from(clusterMap.values())
    .map((qs) => ({ questions: qs }))
    .sort((a, b) => b.questions.length - a.questions.length);
}
