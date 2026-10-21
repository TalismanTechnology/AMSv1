// Sizing find_conflict_candidates calls. Pure, so it is unit-tested;
// lib/conflicts/scan.ts does the I/O.
//
// A call's cost grows with its source chunks (one HNSW lookup each), not its
// documents: twenty one-page notices are quick, one handbook with hundreds of
// chunks can pass the API role's statement timeout (~8s). So documents are
// packed by chunk count, and a call that still times out is split in half
// and retried, down to a single document, which is then skipped.

import type { MaybeDbError } from "@/lib/supabase/not-installed";

/** Source chunks per find_conflict_candidates call. */
export const MAX_CHUNKS_PER_CALL = 60;

const STATEMENT_TIMEOUT = "57014";

/** Postgres canceled the statement at its timeout. */
export function isStatementTimeout(error: MaybeDbError | null | undefined): boolean {
  if (!error) return false;
  return error.code === STATEMENT_TIMEOUT || /statement timeout/i.test(error.message ?? "");
}

/**
 * Consecutive documents, in order, packed into batches of at most maxChunks
 * chunks. A document larger than that is a batch of its own; documents
 * without a count (no chunks) count as none.
 */
export function packByChunkCount(
  documentIds: string[],
  chunkCounts: ReadonlyMap<string, number>,
  maxChunks = MAX_CHUNKS_PER_CALL
): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let size = 0;
  for (const id of documentIds) {
    const chunks = chunkCounts.get(id) ?? 0;
    if (batch.length > 0 && size + chunks > maxChunks) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(id);
    size += chunks;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

export interface SplitCallResult<T> {
  rows: T[];
  /** Documents whose call timed out on their own: skipped. */
  timedOut: string[];
  /** Stopped (expired) with documents not yet tried. */
  truncated: boolean;
}

/**
 * call(ids), and on a statement timeout the same for each half of ids,
 * recursively. A single document that times out is reported in timedOut,
 * not thrown. Other errors are the caller's: call throws them. expired is
 * checked before every retry, so splitting stops at the deadline.
 */
export async function callSplittingOnTimeout<T>(
  ids: string[],
  call: (ids: string[]) => Promise<{ data: T[] | null; error: MaybeDbError | null }>,
  { expired = () => false, onTimeout }: { expired?: () => boolean; onTimeout?: (ids: string[]) => void } = {}
): Promise<SplitCallResult<T>> {
  const result: SplitCallResult<T> = { rows: [], timedOut: [], truncated: false };
  const attempt = async (batch: string[], retry: boolean): Promise<void> => {
    if (result.truncated) return;
    if (retry && expired()) {
      result.truncated = true;
      return;
    }
    const { data, error } = await call(batch);
    if (!error) {
      result.rows.push(...(data ?? []));
      return;
    }
    if (!isStatementTimeout(error)) throw error;
    onTimeout?.(batch);
    if (batch.length === 1) {
      result.timedOut.push(batch[0]);
      return;
    }
    const half = Math.ceil(batch.length / 2);
    await attempt(batch.slice(0, half), true);
    await attempt(batch.slice(half), true);
  };
  await attempt(ids, false);
  return result;
}
