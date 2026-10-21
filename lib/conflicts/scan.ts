import type { SupabaseClient } from "@supabase/supabase-js";
import { formatChunkLocation, type ChunkMetadata } from "@/lib/ai/rag";
import { isNotInstalledError } from "@/lib/supabase/not-installed";
import {
  filterCandidates,
  indexReviewedConflicts,
  pairKey,
  type CandidatePair,
  type ReviewedConflict,
  type SkipReason,
} from "./candidates";
import { nearestCrossDocumentPairs, normalizeVector, parseEmbedding, type EmbeddedChunk } from "./knn";
import { storedExcerpt } from "./quotes";
import type { ScanRunSummary, ScanTrigger } from "./runs";
import { JUDGE_BATCH_SIZE, judgePairs, verdictFor, type JudgePair, type Verdict } from "./judge";
import { applyVerification, needsVerification, verifyConflict, type Verification } from "./verify";
import {
  describeYearClues,
  differentYearEvidence,
  findWeekdayDates,
  yearRange,
  type WeekdayDate,
  type YearRange,
  type YearSide,
} from "./years";

// One conflict scan of a school: candidate pairs from the database
// (find_conflict_candidates, 046), cheap filters (candidates.ts), Gemini's
// judgment (judge.ts) — pairs from different school years (years.ts) are
// auto-dismissed without one — and — when writing — one document_conflicts row per
// judged pair plus a conflict_scan_runs row. Shared by the admin action, the
// daily cron and scripts/scan-conflicts.ts.
//
// A dry run (write: false) reads only: no run row, no judged pairs. With
// inMemoryFallback (the script), a dry run also works before migration 046:
// candidates then come from the school's embeddings in memory (knn.ts).
// Documents and chunks are only ever read.

export const DEFAULT_SIMILARITY_THRESHOLD = 0.85;
export const DEFAULT_MAX_JUDGED = 40;
/** Documents per find_conflict_candidates call, so each call stays short. */
const DOCUMENT_BATCH = 20;
const NEIGHBORS_PER_CHUNK = 8;
const CANDIDATES_PER_CALL = 300;
/** Candidates whose text is loaded for filtering, per pair to judge. */
const POOL_PER_JUDGED = 6;
const JUDGE_CONCURRENCY = 3;
const ID_BATCH = 100;
/** Rows per page when reading a whole school's chunks or conflicts. */
const PAGE_SIZE = 500;
const MAX_REVIEWED_ROWS = 20_000;
const UNIQUE_VIOLATION = "23505";

export type { ScanTrigger, ScanRunSummary } from "./runs";
export { isRunActive } from "./runs";

export interface ScanOptions {
  write: boolean;
  trigger: ScanTrigger;
  /** Scan only these documents' chunks (against the whole school). Default: every ready document. */
  documentIds?: string[] | null;
  maxJudged?: number;
  threshold?: number;
  requestedBy?: string | null;
  /** A conflict_scan_runs row created by the caller (the admin action does, to show progress at once). */
  runId?: string | null;
  /** Epoch ms after which no new database batch or model call starts. */
  deadline?: number;
  /**
   * Dry run only: when find_conflict_candidates is missing (046 not
   * applied), find candidates in memory from every chunk's embedding. Slow
   * and memory-hungry — for scripts/scan-conflicts.ts, never a request.
   */
  inMemoryFallback?: boolean;
  /** Progress lines (the script prints them). */
  log?: (message: string) => void;
}

export interface JudgedPairView {
  similarity: number;
  documentA: string;
  documentB: string;
  documentAId: string;
  documentBId: string;
  /** file_type, e.g. "pdf"; null when unknown. */
  documentAType: string | null;
  documentBType: string | null;
  /** How each document arrived: 'upload', 'email', 'website'… */
  documentASource: string | null;
  documentBSource: string | null;
  chunkAId: string;
  chunkBId: string;
  chunkAIndex: number;
  chunkBIndex: number;
  /** False for a different_year pair dismissed before judging. */
  judgedByModel: boolean;
  /** The model's answer, before the confidence, quote and year checks (false when not judged). */
  isConflict: boolean;
  status: Verdict["status"];
  reason?: Verdict["reason"];
  /** The skeptical second opinion, for pairs the judge kept open (verify.ts). */
  verification?: Verification;
  topic: string;
  description: string;
  statementA: string;
  statementB: string;
  confidence: number;
}

export interface ScanResult {
  /** False when migration 046 isn't applied: nothing was scanned. */
  installed: boolean;
  /** Candidates came from the in-memory fallback (046 not applied; dry run). */
  inMemory: boolean;
  runId: string | null;
  documentsScanned: number;
  pairsConsidered: number;
  pairsJudged: number;
  conflictsFound: number;
  /** Candidates not sent to the model, by reason (different_year ones are still stored, auto-dismissed). */
  skipped: Partial<Record<SkipReason, number>>;
  /** Judged pairs the model called conflicts but that were auto-dismissed, by reason. */
  autoDismissed: Partial<Record<NonNullable<Verdict["reason"]>, number>>;
  /** Judged pairs, then the different_year pairs auto-dismissed before judging. */
  judged: JudgedPairView[];
  /** The scan stopped at the deadline with work left. */
  truncated: boolean;
  error?: string;
}

interface DocInfo {
  id: string;
  title: string;
  file_type: string | null;
  source: string | null;
  source_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  email_date: string | null;
  divisions: string[];
}

interface ChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata: ChunkMetadata | null;
}

class NotInstalled extends Error {}

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function errorMessage(err: unknown): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : String(err);
}

/** Start a run row. Null when the feature isn't installed. */
export async function startScanRun(
  supabase: SupabaseClient,
  schoolId: string,
  trigger: ScanTrigger,
  requestedBy: string | null = null
): Promise<{ runId: string } | { notInstalled: true } | { error: string }> {
  const { data, error } = await supabase
    .from("conflict_scan_runs")
    .insert({ school_id: schoolId, trigger, requested_by: requestedBy, status: "running" })
    .select("id")
    .single();
  if (error) return isNotInstalledError(error) ? { notInstalled: true } : { error: error.message };
  return { runId: data.id as string };
}

async function finishScanRun(supabase: SupabaseClient, runId: string, result: ScanResult) {
  const { error } = await supabase
    .from("conflict_scan_runs")
    .update({
      status: result.error ? "failed" : "completed",
      finished_at: new Date().toISOString(),
      documents_scanned: result.documentsScanned,
      pairs_considered: result.pairsConsidered,
      pairs_judged: result.pairsJudged,
      conflicts_found: result.conflictsFound,
      error: result.error ?? (result.truncated ? "Stopped at the time limit; the next scan continues." : null),
    })
    .eq("id", runId);
  if (error) console.error("[conflicts] Recording the scan run failed:", error.message);
}

async function readyDocumentIds(supabase: SupabaseClient, schoolId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "ready")
    .order("updated_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`Listing documents failed: ${error.message}`);
  return (data ?? []).map((d) => d.id as string);
}

interface CandidateFetch {
  candidates: CandidatePair[];
  truncated: boolean;
  /** Chunks already read (the in-memory fallback reads them all). */
  chunks?: Map<string, ChunkRow>;
  inMemory?: boolean;
}

async function fetchCandidates(
  supabase: SupabaseClient,
  schoolId: string,
  documentIds: string[],
  threshold: number,
  deadline: number
): Promise<CandidateFetch> {
  const candidates: CandidatePair[] = [];
  for (const [i, batch] of chunked(documentIds, DOCUMENT_BATCH).entries()) {
    if (i > 0 && Date.now() > deadline) return { candidates, truncated: true };
    const { data, error } = await supabase.rpc("find_conflict_candidates", {
      p_school_id: schoolId,
      p_document_ids: batch,
      p_threshold: threshold,
      p_neighbors: NEIGHBORS_PER_CHUNK,
      p_limit: CANDIDATES_PER_CALL,
    });
    if (error) {
      if (isNotInstalledError(error)) throw new NotInstalled();
      throw new Error(`Finding candidate pairs failed: ${error.message}`);
    }
    candidates.push(...((data ?? []) as CandidatePair[]));
  }
  return { candidates, truncated: false };
}

type EmbeddedChunkRow = ChunkRow & { embedding: unknown };

/**
 * The in-memory fallback: every chunk of the school's ready documents with
 * its embedding, then each chunk's nearest neighbours in other documents.
 */
async function inMemoryCandidates(
  supabase: SupabaseClient,
  schoolId: string,
  sourceIds: string[] | null,
  threshold: number,
  log: (message: string) => void
): Promise<CandidateFetch> {
  const ready = new Set(await readyDocumentIds(supabase, schoolId));
  const chunks = new Map<string, ChunkRow>();
  const embedded: EmbeddedChunk[] = [];
  let unreadable = 0;
  let lastId: string | null = null;
  const started = Date.now();
  for (let page = 1; ; page++) {
    let query = supabase
      .from("document_chunks")
      .select("id, document_id, chunk_index, content, metadata, embedding")
      .eq("school_id", schoolId)
      .not("embedding", "is", null)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt("id", lastId);
    const { data, error } = await query.returns<EmbeddedChunkRow[]>();
    if (error) throw new Error(`Reading chunks failed: ${error.message}`);
    const rows = data ?? [];
    for (const { embedding, ...row } of rows) {
      if (!ready.has(row.document_id)) continue;
      const vector = parseEmbedding(embedding);
      if (!vector || !normalizeVector(vector)) {
        unreadable++;
        continue;
      }
      chunks.set(row.id, row);
      embedded.push({ id: row.id, document_id: row.document_id, vector });
    }
    if (rows.length < PAGE_SIZE) break;
    lastId = rows[rows.length - 1].id;
    if (page % 10 === 0) log(`  read ${embedded.length} chunks…`);
  }
  log(
    `Read ${embedded.length} chunks of ${ready.size} ready documents in ${((Date.now() - started) / 1000).toFixed(1)}s` +
      (unreadable ? ` (${unreadable} without a readable embedding skipped)` : "") +
      `. Finding nearest neighbours (k=${NEIGHBORS_PER_CHUNK}, similarity >= ${threshold})…`
  );

  const knnStarted = Date.now();
  let lastLogged = 0;
  const candidates = nearestCrossDocumentPairs(embedded, {
    k: NEIGHBORS_PER_CHUNK,
    threshold,
    sourceDocumentIds: sourceIds ? new Set(sourceIds) : null,
    onProgress: (fraction) => {
      if (fraction - lastLogged < 0.1 && fraction < 1) return;
      lastLogged = fraction;
      log(`  ${Math.round(fraction * 100)}% (${((Date.now() - knnStarted) / 1000).toFixed(1)}s)`);
    },
  });
  log(`Found ${candidates.length} candidate pairs in memory.`);
  return { candidates, truncated: false, chunks, inMemory: true };
}

/** pairKey()s already in document_conflicts. `optional`: a missing table means none. */
async function fetchJudgedKeys(
  supabase: SupabaseClient,
  schoolId: string,
  keys: string[],
  optional: boolean
): Promise<Set<string>> {
  const judged = new Set<string>();
  for (const batch of chunked(keys, ID_BATCH)) {
    const { data, error } = await supabase
      .from("document_conflicts")
      .select("pair_key")
      .eq("school_id", schoolId)
      .in("pair_key", batch);
    if (error) {
      if (isNotInstalledError(error)) {
        if (optional) return judged;
        throw new NotInstalled();
      }
      throw new Error(`Reading judged pairs failed: ${error.message}`);
    }
    for (const row of data ?? []) judged.add(row.pair_key as string);
  }
  return judged;
}

/**
 * The school's judged conflicts that carry both statements, so a conflict
 * already reviewed isn't judged again under new chunk ids after re-chunking.
 */
async function fetchReviewedConflicts(
  supabase: SupabaseClient,
  schoolId: string,
  optional: boolean
): Promise<ReviewedConflict[]> {
  const rows: ReviewedConflict[] = [];
  for (let from = 0; from < MAX_REVIEWED_ROWS; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("document_conflicts")
      .select("document_a_id, document_b_id, statement_a, statement_b")
      .eq("school_id", schoolId)
      .not("statement_a", "is", null)
      .not("statement_b", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .returns<ReviewedConflict[]>();
    if (error) {
      if (isNotInstalledError(error)) {
        if (optional) return rows;
        throw new NotInstalled();
      }
      throw new Error(`Reading judged conflicts failed: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchChunks(supabase: SupabaseClient, ids: string[]): Promise<Map<string, ChunkRow>> {
  const chunks = new Map<string, ChunkRow>();
  for (const batch of chunked(ids, ID_BATCH)) {
    const { data, error } = await supabase
      .from("document_chunks")
      .select("id, document_id, chunk_index, content, metadata")
      .in("id", batch);
    if (error) throw new Error(`Reading chunks failed: ${error.message}`);
    for (const row of (data ?? []) as ChunkRow[]) chunks.set(row.id, row);
  }
  return chunks;
}

type DocRow = {
  id: string;
  title: string | null;
  file_type?: string | null;
  source?: string | null;
  source_url?: string | null;
  created_at: string | null;
  updated_at: string | null;
  email_meta?: { date?: unknown } | null;
  divisions?: { name: string }[] | null;
};

async function fetchDocuments(supabase: SupabaseClient, ids: string[]): Promise<Map<string, DocInfo>> {
  const docs = new Map<string, DocInfo>();
  const full =
    "id, title, file_type, source, source_url, created_at, updated_at, email_meta, divisions:event_calendars(name)";
  const basic = "id, title, file_type, created_at, updated_at";
  for (const batch of chunked(ids, ID_BATCH)) {
    const query = (columns: string) =>
      supabase.from("documents").select(columns).in("id", batch).returns<DocRow[]>();
    let result = await query(full);
    // Older schemas lack source_url / email_meta / divisions: carry on without them.
    if (result.error) result = await query(basic);
    if (result.error) throw new Error(`Reading documents failed: ${result.error.message}`);
    for (const d of result.data ?? []) {
      const emailDate = typeof d.email_meta?.date === "string" ? d.email_meta.date : null;
      docs.set(d.id, {
        id: d.id,
        title: d.title || "Untitled document",
        file_type: d.file_type ?? null,
        source: d.source ?? null,
        source_url: d.source_url ?? null,
        created_at: d.created_at,
        updated_at: d.updated_at,
        email_date: emailDate,
        divisions: (d.divisions ?? []).map((v) => v.name).filter(Boolean),
      });
    }
  }
  return docs;
}

function day(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function describeDates(doc: DocInfo): string {
  const parts: string[] = [];
  const created = day(doc.created_at);
  const updated = day(doc.updated_at);
  const emailed = day(doc.email_date);
  if (emailed) parts.push(`email sent ${emailed}`);
  if (created) parts.push(`added ${created}`);
  if (updated && updated !== created) parts.push(`last processed ${updated}`);
  return parts.join("; ");
}

/** Each document's weekday dates, from whichever of its chunks were read. */
function weekdayDatesByDocument(
  chunkSets: Map<string, ChunkRow>[],
  documentIds: Set<string>,
  range: YearRange
): Map<string, WeekdayDate[]> {
  const byDocument = new Map<string, WeekdayDate[]>();
  const seen = new Set<string>();
  for (const set of chunkSets) {
    for (const chunk of set.values()) {
      if (seen.has(chunk.id) || !documentIds.has(chunk.document_id)) continue;
      seen.add(chunk.id);
      const dates = findWeekdayDates(chunk.content, range);
      if (dates.length === 0) continue;
      const list = byDocument.get(chunk.document_id);
      if (list) list.push(...dates);
      else byDocument.set(chunk.document_id, dates);
    }
  }
  return byDocument;
}

const docTime = (d: DocInfo | undefined) => new Date(d?.email_date ?? d?.created_at ?? 0).getTime() || 0;

function pageOf(metadata: ChunkMetadata | null): number | null {
  return typeof metadata?.page === "number" ? metadata.page : null;
}

/**
 * Scan one school for conflicting documents. Never throws; failures are in
 * `error` (and on the run row when writing).
 */
export async function scanSchoolConflicts(
  supabase: SupabaseClient,
  schoolId: string,
  options: ScanOptions
): Promise<ScanResult> {
  const {
    write,
    trigger,
    maxJudged = DEFAULT_MAX_JUDGED,
    threshold = DEFAULT_SIMILARITY_THRESHOLD,
    requestedBy = null,
    deadline = Number.POSITIVE_INFINITY,
    log = () => {},
  } = options;
  // Never when writing: a write needs 046 for the rows anyway.
  const inMemoryFallback = !write && !!options.inMemoryFallback;

  const result: ScanResult = {
    installed: true,
    inMemory: false,
    runId: options.runId ?? null,
    documentsScanned: 0,
    pairsConsidered: 0,
    pairsJudged: 0,
    conflictsFound: 0,
    skipped: {},
    autoDismissed: {},
    judged: [],
    truncated: false,
  };

  if (write && !result.runId) {
    const started = await startScanRun(supabase, schoolId, trigger, requestedBy);
    if ("notInstalled" in started) return { ...result, installed: false };
    if ("error" in started) return { ...result, error: started.error };
    result.runId = started.runId;
  }

  try {
    await runScan(
      supabase,
      schoolId,
      { write, maxJudged, threshold, deadline, documentIds: options.documentIds, inMemoryFallback, log },
      result
    );
  } catch (err) {
    if (err instanceof NotInstalled) {
      result.installed = false;
      result.error = "Conflict detection isn't installed (migration 046).";
    } else {
      console.error(`[conflicts] Scan of school ${schoolId} failed:`, err);
      result.error = errorMessage(err);
    }
  }

  if (write && result.runId) await finishScanRun(supabase, result.runId, result);
  return result;
}

async function runScan(
  supabase: SupabaseClient,
  schoolId: string,
  {
    write,
    maxJudged,
    threshold,
    deadline,
    documentIds,
    inMemoryFallback,
    log,
  }: {
    write: boolean;
    maxJudged: number;
    threshold: number;
    deadline: number;
    documentIds?: string[] | null;
    inMemoryFallback: boolean;
    log: (message: string) => void;
  },
  result: ScanResult
): Promise<void> {
  const sourceIds = documentIds ? [...new Set(documentIds)] : await readyDocumentIds(supabase, schoolId);
  result.documentsScanned = sourceIds.length;
  if (sourceIds.length === 0 || maxJudged <= 0) return;

  let fetched: CandidateFetch;
  try {
    fetched = await fetchCandidates(supabase, schoolId, sourceIds, threshold, deadline);
  } catch (err) {
    if (!(err instanceof NotInstalled) || !inMemoryFallback) throw err;
    log("find_conflict_candidates isn't installed (migration 046): finding candidates in memory instead.");
    fetched = await inMemoryCandidates(supabase, schoolId, documentIds ? sourceIds : null, threshold, log);
  }
  const { candidates, truncated } = fetched;
  result.truncated = truncated;
  result.inMemory = !!fetched.inMemory;

  // Best pairs first; only the top of the list is worth loading text for.
  const unique = new Map<string, CandidatePair>();
  for (const c of candidates) {
    const key = pairKey(c.chunk_a_id, c.chunk_b_id);
    const seen = unique.get(key);
    if (!seen || c.similarity > seen.similarity) unique.set(key, c);
  }
  result.pairsConsidered = unique.size;
  if (unique.size === 0) return;

  const pool = [...unique.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxJudged * POOL_PER_JUDGED);
  // In memory means 046 may be missing: then nothing was judged before.
  const optional = result.inMemory;
  const poolChunkIds = [...new Set(pool.flatMap((c) => [c.chunk_a_id, c.chunk_b_id]))];
  const preloaded = fetched.chunks ?? new Map<string, ChunkRow>();
  const [judged, reviewed, loaded, documents] = await Promise.all([
    fetchJudgedKeys(supabase, schoolId, pool.map((c) => pairKey(c.chunk_a_id, c.chunk_b_id)), optional),
    fetchReviewedConflicts(supabase, schoolId, optional),
    fetchChunks(supabase, poolChunkIds.filter((id) => !preloaded.has(id))),
    fetchDocuments(supabase, [...new Set(pool.flatMap((c) => [c.document_a_id, c.document_b_id]))]),
  ]);
  const chunks = new Map<string, ChunkRow>();
  for (const id of poolChunkIds) {
    const chunk = preloaded.get(id) ?? loaded.get(id);
    if (chunk) chunks.set(id, chunk);
  }

  const range = yearRange();
  const poolDocumentIds = new Set(pool.flatMap((c) => [c.document_a_id, c.document_b_id]));
  const documentDates = weekdayDatesByDocument([preloaded, loaded], poolDocumentIds, range);
  const yearSide = (docId: string, text: string): YearSide => ({
    title: documents.get(docId)?.title ?? "",
    text,
    documentDates: documentDates.get(docId),
  });

  const { selected, differentYear, skipped } = filterCandidates(
    pool,
    {
      documents,
      chunks,
      judged,
      reviewed: indexReviewedConflicts(reviewed),
      differentYear: (c, a, b) =>
        differentYearEvidence(yearSide(c.document_a_id, a), yearSide(c.document_b_id, b), range) !== null,
    },
    { limit: maxJudged }
  );
  result.skipped = Object.fromEntries(Object.entries(skipped).filter(([, n]) => n > 0));
  if (unique.size > pool.length) {
    result.skipped.over_limit = (result.skipped.over_limit ?? 0) + unique.size - pool.length;
  }

  // Older document as A, so admins read the pair in the order it was written.
  const orient = (c: CandidatePair): CandidatePair =>
    docTime(documents.get(c.document_b_id)) < docTime(documents.get(c.document_a_id))
      ? {
          chunk_a_id: c.chunk_b_id,
          chunk_b_id: c.chunk_a_id,
          document_a_id: c.document_b_id,
          document_b_id: c.document_a_id,
          similarity: c.similarity,
        }
      : c;
  const oriented = selected.map(orient);

  const sideFor = (chunkId: string, docId: string): JudgePair["a"] => {
    const chunk = chunks.get(chunkId)!;
    const doc = documents.get(docId);
    return {
      documentTitle: doc?.title ?? "Untitled document",
      documentDates: doc ? describeDates(doc) : "",
      source: doc?.source ?? (doc?.source_url ? "website" : null),
      yearClues: describeYearClues(yearSide(docId, chunk.content), range),
      divisions: doc?.divisions ?? [],
      location: formatChunkLocation(chunk.metadata ?? undefined)?.label ?? null,
      text: chunk.content,
    };
  };

  const view = (c: CandidatePair, chunkA: ChunkRow, chunkB: ChunkRow) => {
    const docA = documents.get(c.document_a_id);
    const docB = documents.get(c.document_b_id);
    return {
      similarity: c.similarity,
      documentA: docA?.title ?? c.document_a_id,
      documentB: docB?.title ?? c.document_b_id,
      documentAId: c.document_a_id,
      documentBId: c.document_b_id,
      documentAType: docA?.file_type ?? null,
      documentBType: docB?.file_type ?? null,
      documentASource: docA?.source ?? null,
      documentBSource: docB?.source ?? null,
      chunkAId: c.chunk_a_id,
      chunkBId: c.chunk_b_id,
      chunkAIndex: chunkA.chunk_index,
      chunkBIndex: chunkB.chunk_index,
    };
  };
  const rowFor = (c: CandidatePair, chunkA: ChunkRow, chunkB: ChunkRow) => ({
    school_id: schoolId,
    chunk_a_id: c.chunk_a_id,
    chunk_b_id: c.chunk_b_id,
    document_a_id: c.document_a_id,
    document_b_id: c.document_b_id,
    chunk_a_index: chunkA.chunk_index,
    chunk_b_index: chunkB.chunk_index,
    chunk_a_page: pageOf(chunkA.metadata),
    chunk_b_page: pageOf(chunkB.metadata),
    similarity: c.similarity,
  });

  const batches = chunked(oriented, JUDGE_BATCH_SIZE);
  const rows: Record<string, unknown>[] = [];

  // Different school years: stored auto-dismissed, never judged.
  for (const c of differentYear.map(orient)) {
    const chunkA = chunks.get(c.chunk_a_id)!;
    const chunkB = chunks.get(c.chunk_b_id)!;
    const evidence =
      differentYearEvidence(
        yearSide(c.document_a_id, chunkA.content),
        yearSide(c.document_b_id, chunkB.content),
        range
      ) ?? "Different school years.";
    result.judged.push({
      ...view(c, chunkA, chunkB),
      judgedByModel: false,
      isConflict: false,
      status: "auto_dismissed",
      reason: "different_year",
      topic: "",
      description: evidence,
      statementA: "",
      statementB: "",
      confidence: 0,
    });
    rows.push({
      ...rowFor(c, chunkA, chunkB),
      topic: null,
      description: evidence.slice(0, 1000),
      statement_a: null,
      statement_b: null,
      excerpt_a: storedExcerpt(chunkA.content, null),
      excerpt_b: storedExcerpt(chunkB.content, null),
      confidence: null,
      status: "auto_dismissed",
    });
  }
  const judgedViews: JudgedPairView[] = [];
  for (let i = 0; i < batches.length; i += JUDGE_CONCURRENCY) {
    if (Date.now() > deadline) {
      result.truncated = true;
      break;
    }
    const wave = batches.slice(i, i + JUDGE_CONCURRENCY);
    const answers = await Promise.all(
      wave.map((batch) =>
        judgePairs(
          batch.map(
            (c): JudgePair => ({
              a: sideFor(c.chunk_a_id, c.document_a_id),
              b: sideFor(c.chunk_b_id, c.document_b_id),
            })
          )
        )
      )
    );

    // Unanswered pairs aren't stored, so the next scan tries them again.
    const answered = wave.flatMap((batch, w) =>
      batch.flatMap((c, k) => {
        const judgment = answers[w][k];
        if (!judgment) return [];
        const chunkA = chunks.get(c.chunk_a_id)!;
        const chunkB = chunks.get(c.chunk_b_id)!;
        return [{ c, chunkA, chunkB, verdict: verdictFor(judgment, chunkA.content, chunkB.content, range) }];
      })
    );
    // Every pair the judge kept open gets a skeptical second call.
    const verifications = await Promise.all(
      answered.map(({ c, verdict }) =>
        needsVerification(verdict)
          ? verifyConflict(
              { a: sideFor(c.chunk_a_id, c.document_a_id), b: sideFor(c.chunk_b_id, c.document_b_id) },
              verdict.judgment
            )
          : Promise.resolve(undefined)
      )
    );

    answered.forEach(({ c, chunkA, chunkB, verdict: judged }, n) => {
      const verification = verifications[n];
      const verdict = verification === undefined ? judged : applyVerification(judged, verification);
      // A failed verifier call: not stored, judged again next scan.
      if (!verdict) return;
      result.pairsJudged++;
      if (verdict.status === "open") result.conflictsFound++;
      if (verdict.reason) {
        result.autoDismissed[verdict.reason] = (result.autoDismissed[verdict.reason] ?? 0) + 1;
      }
      const j = verdict.judgment;
      judgedViews.push({
        ...view(c, chunkA, chunkB),
        judgedByModel: true,
        isConflict: j.is_conflict,
        status: verdict.status,
        reason: verdict.reason,
        verification: verification ?? undefined,
        topic: j.topic,
        description: j.description,
        statementA: j.statement_a,
        statementB: j.statement_b,
        confidence: j.confidence,
      });
      const statementA = j.statement_a?.trim().slice(0, 1000) || null;
      const statementB = j.statement_b?.trim().slice(0, 1000) || null;
      rows.push({
        ...rowFor(c, chunkA, chunkB),
        topic: j.topic?.trim().slice(0, 200) || null,
        description: j.description?.trim().slice(0, 1000) || null,
        statement_a: statementA,
        statement_b: statementB,
        excerpt_a: storedExcerpt(chunkA.content, statementA),
        excerpt_b: storedExcerpt(chunkB.content, statementB),
        confidence: j.confidence,
        status: verdict.status,
      });
    });
  }

  // Judged pairs first, as before; then the different-year ones.
  result.judged = [...judgedViews, ...result.judged];

  if (!write || rows.length === 0) return;

  // Judged pairs were checked against pair_key before judging, so a plain
  // insert. The unique index on pair_key is partial (046), which an upsert
  // can't target; if a concurrent scan stored one of these pairs meanwhile,
  // insert row by row and let its first row — and any ruling on it — stand.
  const insert = (batch: Record<string, unknown>[]) => supabase.from("document_conflicts").insert(batch);
  const { error } = await insert(rows);
  if (!error) return;
  if (isNotInstalledError(error)) throw new NotInstalled();
  if (error.code !== UNIQUE_VIOLATION) throw new Error(`Saving judged pairs failed: ${error.message}`);
  for (const row of rows) {
    const { error: rowError } = await insert([row]);
    if (rowError && rowError.code !== UNIQUE_VIOLATION) {
      throw new Error(`Saving judged pairs failed: ${rowError.message}`);
    }
  }
}

/** The school's newest scan run; installed: false before migration 046. */
export async function latestScanRun(
  supabase: SupabaseClient,
  schoolId: string
): Promise<{ installed: boolean; run: ScanRunSummary | null; error?: string }> {
  const { data, error } = await supabase
    .from("conflict_scan_runs")
    .select(
      "id, trigger, status, started_at, finished_at, documents_scanned, pairs_considered, pairs_judged, conflicts_found, error"
    )
    .eq("school_id", schoolId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return isNotInstalledError(error)
      ? { installed: false, run: null }
      : { installed: true, run: null, error: error.message };
  }
  return { installed: true, run: (data as ScanRunSummary | null) ?? null };
}

/** With no earlier scan, the daily cron looks back this far (full scans are admin-initiated). */
export const FIRST_CRON_LOOKBACK_MS = 48 * 60 * 60 * 1000;

/**
 * The daily incremental scan: documents that became ready since the school's
 * last completed scan, against the rest of the school. Does nothing (and
 * records no run) when no document changed.
 */
export async function scanRecentlyProcessed(
  supabase: SupabaseClient,
  schoolId: string,
  { maxJudged, deadline, now = new Date() }: { maxJudged: number; deadline: number; now?: Date }
): Promise<ScanResult | { installed: false } | { unchanged: true }> {
  const { data: last, error: lastError } = await supabase
    .from("conflict_scan_runs")
    .select("started_at")
    .eq("school_id", schoolId)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) {
    if (isNotInstalledError(lastError)) return { installed: false };
    throw new Error(`Reading scan runs failed: ${lastError.message}`);
  }
  // From the previous run's start, so a document processed during it is included.
  const since = last?.started_at ?? new Date(now.getTime() - FIRST_CRON_LOOKBACK_MS).toISOString();

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "ready")
    .gt("updated_at", since)
    .limit(500);
  if (error) throw new Error(`Listing changed documents failed: ${error.message}`);
  if (!docs?.length) return { unchanged: true };

  return scanSchoolConflicts(supabase, schoolId, {
    write: true,
    trigger: "cron",
    documentIds: docs.map((d) => d.id as string),
    maxJudged,
    deadline,
  });
}
