import { pairKey, type CandidatePair } from "./candidates";

// Candidate pairs without the database function: each chunk's nearest
// neighbours in OTHER documents, brute force over embeddings held in memory.
// Only scripts/scan-conflicts.ts uses it, for a dry run before migration 046
// (find_conflict_candidates) is applied. Pure; the script does the I/O.
//
// Same result as the SQL: every source chunk's top `k` chunks of other
// documents with cosine similarity >= threshold, each unordered pair once.
// O(n²·d) — about 10–20k chunks of 768 dims is tens of seconds to a few
// minutes — so it reports progress.

export interface EmbeddedChunk {
  id: string;
  document_id: string;
  /** Unit length (see normalizeVector). */
  vector: Float32Array;
}

/** A pgvector value as PostgREST returns it ("[0.1,0.2,…]") or an array. Null if unreadable. */
export function parseEmbedding(value: unknown): Float32Array | null {
  let numbers: unknown = value;
  if (typeof value === "string") {
    try {
      numbers = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(numbers) || numbers.length === 0) return null;
  const out = new Float32Array(numbers.length);
  for (let i = 0; i < numbers.length; i++) {
    const n = numbers[i];
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
    out[i] = n;
  }
  return out;
}

/** Scale to unit length in place, so a dot product is the cosine. False for a zero vector. */
export function normalizeVector(v: Float32Array): boolean {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  if (sum === 0) return false;
  const inv = 1 / Math.sqrt(sum);
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return true;
}

export interface NearestOptions {
  k: number;
  threshold: number;
  /** Only these documents' chunks look for neighbours (an incremental scan). Default: all. */
  sourceDocumentIds?: Set<string> | null;
  /** Called every so often with the share of the work done, 0–1. */
  onProgress?: (fraction: number) => void;
}

/**
 * Each source chunk's `k` most similar chunks in other documents (cosine >=
 * threshold), as candidate pairs, each unordered pair once at its similarity.
 * Chunks whose vector length differs from the first chunk's are ignored.
 */
export function nearestCrossDocumentPairs(
  chunks: EmbeddedChunk[],
  { k, threshold, sourceDocumentIds = null, onProgress }: NearestOptions
): CandidatePair[] {
  if (chunks.length < 2 || k < 1) return [];
  const dim = chunks[0].vector.length;
  const items = chunks.filter((c) => c.vector.length === dim);
  const n = items.length;

  // One contiguous matrix, row i at i * dim, for a cache-friendly inner loop.
  const matrix = new Float32Array(n * dim);
  items.forEach((c, i) => matrix.set(c.vector, i * dim));
  const docOf = new Int32Array(n);
  const docIndex = new Map<string, number>();
  items.forEach((c, i) => {
    let d = docIndex.get(c.document_id);
    if (d === undefined) docIndex.set(c.document_id, (d = docIndex.size));
    docOf[i] = d;
  });
  const isSource = items.map((c) => !sourceDocumentIds || sourceDocumentIds.has(c.document_id));

  // Per source chunk, its best k so far: parallel arrays, plus the weakest
  // kept similarity to compare against.
  const topIdx: number[][] = Array.from({ length: n }, () => []);
  const topSim: number[][] = Array.from({ length: n }, () => []);
  const floor = new Float64Array(n).fill(threshold);
  const offer = (i: number, j: number, sim: number) => {
    const sims = topSim[i];
    if (sims.length < k) {
      sims.push(sim);
      topIdx[i].push(j);
      if (sims.length === k) floor[i] = Math.max(threshold, Math.min(...sims));
      return;
    }
    if (sim <= floor[i]) return;
    let worst = 0;
    for (let m = 1; m < sims.length; m++) if (sims[m] < sims[worst]) worst = m;
    sims[worst] = sim;
    topIdx[i][worst] = j;
    floor[i] = Math.max(threshold, Math.min(...sims));
  };

  const step = Math.max(1, Math.floor(n / 20));
  for (let i = 0; i < n; i++) {
    const ai = i * dim;
    const di = docOf[i];
    const si = isSource[i];
    for (let j = i + 1; j < n; j++) {
      if (docOf[j] === di || (!si && !isSource[j])) continue;
      const bj = j * dim;
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      let s3 = 0;
      let t = 0;
      for (; t + 3 < dim; t += 4) {
        s0 += matrix[ai + t] * matrix[bj + t];
        s1 += matrix[ai + t + 1] * matrix[bj + t + 1];
        s2 += matrix[ai + t + 2] * matrix[bj + t + 2];
        s3 += matrix[ai + t + 3] * matrix[bj + t + 3];
      }
      for (; t < dim; t++) s0 += matrix[ai + t] * matrix[bj + t];
      const sim = s0 + s1 + s2 + s3;
      if (sim < threshold) continue;
      if (si && (topSim[i].length < k || sim > floor[i])) offer(i, j, sim);
      if (isSource[j] && (topSim[j].length < k || sim > floor[j])) offer(j, i, sim);
    }
    // Row i compares against the n - i - 1 rows after it.
    if (onProgress && ((i + 1) % step === 0 || i + 1 === n)) onProgress(1 - ((n - i - 1) / n) ** 2);
  }

  const pairs = new Map<string, CandidatePair>();
  for (let i = 0; i < n; i++) {
    topIdx[i].forEach((j, m) => {
      const a = items[i];
      const b = items[j];
      const similarity = Math.min(1, topSim[i][m]);
      const key = pairKey(a.id, b.id);
      const seen = pairs.get(key);
      if (!seen || similarity > seen.similarity) {
        pairs.set(key, {
          chunk_a_id: a.id,
          chunk_b_id: b.id,
          document_a_id: a.document_id,
          document_b_id: b.document_id,
          similarity,
        });
      }
    });
  }
  return [...pairs.values()].sort((x, y) => y.similarity - x.similarity);
}
