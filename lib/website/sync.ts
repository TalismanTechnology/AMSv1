import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyStatus,
  conditionalHeaders,
  htmlContentHash,
  MIN_INGEST_CHARS,
  needsReingest,
  nextMissingState,
  sha256,
  shouldApplyMissing,
} from "./change";
import {
  deleteWebsiteDocuments,
  pageDocumentText,
  pdfTitleFromUrl,
  upsertWebsiteDocument,
  type PageKind,
} from "./documents";
import { extractPage } from "./extract";
import {
  capForContentType,
  decodeHtml,
  isHtmlContentType,
  isPdfContentType,
  MAX_PDF_BYTES,
  politeFetch,
} from "./fetch";
import { crawlDelayMs, isAllowedByRobots, parseRobots, type Robots } from "./robots";
import { parseSitemap, sitemapBodyToText } from "./sitemap";
import { filterUrl, looksLikePdf, toSiteUrl, type Site } from "./url";

// A website sync ("run") crawls one source's site and brings its documents up
// to date. Runs are long — hundreds of pages at ≥1s apart, each possibly
// re-embedded — so they execute as a series of time-boxed batches (cron every
// few minutes, or "Sync now"), with the crawl frontier persisted in
// website_sync_queue between them:
//
//   startWebsiteSync    → new run number, robots.txt fetched, queue seeded
//                         with the sitemaps and the root page
//   runWebsiteSyncBatch → works queued URLs across running sources until the
//                         time budget runs out; a source whose queue empties
//                         is finalized (missing pages aged out, status set)

const MAX_DEPTH = 6;
/** Discovered URLs allowed in the queue per run, as a multiple of max_pages. */
const QUEUE_CAP_MULTIPLIER = 4;
const MAX_SITEMAPS_PER_RUN = 50;
const MAX_SITEMAP_BYTES = 10 * 1024 * 1024;
/** Don't start an item with less than this left: processing a page can take a while. */
const ITEM_RESERVE_MS = 45_000;
/** Items are retried across batches (a killed function leaves them pending). */
const MAX_ATTEMPTS = 3;
const MAX_SOURCES_PER_BATCH = 10;
const LEASE_GRACE_MS = 120_000;
/** A finished run is only restarted by the cron after this long. */
export const RESYNC_INTERVAL_MS = 20 * 60 * 60 * 1000;

export interface WebsiteSourceRow {
  id: string;
  school_id: string;
  root_url: string;
  include_patterns: string[];
  exclude_patterns: string[];
  max_pages: number;
  enabled: boolean;
  canonical_origin: string | null;
  robots_txt: string | null;
  current_run: number;
  lease_until: string | null;
  last_sync_started_at: string | null;
  last_sync_finished_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  page_count: number;
  sync_count: number;
}

interface PageRow {
  id: string;
  url: string;
  content_hash: string | null;
  etag: string | null;
  last_modified: string | null;
  document_id: string | null;
  links: string[] | null;
  last_seen_run: number | null;
  missing_count: number;
}

interface QueueItem {
  id: number;
  url: string;
  kind: "page" | "sitemap";
  depth: number;
  attempts: number;
}

interface SourceState {
  source: WebsiteSourceRow;
  run: number;
  site: Site;
  robots: Robots;
  delayMs: number;
  nextFetchAt: number;
  seenThisRun: number;
  queued: number;
  sitemapsQueued: number;
  buffer: QueueItem[];
  finished: boolean;
}

type Db = SupabaseClient;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function siteOf(source: WebsiteSourceRow): Site {
  return { origin: source.canonical_origin ?? new URL(source.root_url).origin };
}

// ── Starting a run ───────────────────────────────────────────────────────────

export type StartResult =
  | { started: true; run: number }
  | { started: false; reason: "already_running" | "not_found" | "disabled" }
  | { started: false; reason: "error"; error: string };

/**
 * Begin a new sync run for a source: claim the next run number, resolve the
 * canonical origin (following the root URL's redirects, e.g. apex → www),
 * fetch robots.txt, and seed the queue with sitemaps and the root page.
 */
export async function startWebsiteSync(sourceId: string): Promise<StartResult> {
  const supabase = createAdminClient();

  const { data: source } = await supabase
    .from("website_sources")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle<WebsiteSourceRow>();
  if (!source) return { started: false, reason: "not_found" };
  if (!source.enabled) return { started: false, reason: "disabled" };
  if (source.last_sync_status === "running") return { started: false, reason: "already_running" };

  // Optimistic claim on current_run: two simultaneous starts can't both win.
  const run = source.current_run + 1;
  const startedAt = new Date().toISOString();
  const { data: claimed } = await supabase
    .from("website_sources")
    .update({
      current_run: run,
      last_sync_status: "running",
      last_sync_started_at: startedAt,
      last_sync_error: null,
      updated_at: startedAt,
    })
    .eq("id", sourceId)
    .eq("current_run", source.current_run)
    .select("id");
  if (!claimed?.length) return { started: false, reason: "already_running" };

  try {
    // Where does the root really live? Body isn't needed (cap 0).
    const root = await politeFetch(source.root_url, { maxBytes: () => 0 });
    if (root.status >= 400) {
      throw new Error(`The root URL returned HTTP ${root.status}.`);
    }
    const origin = new URL(root.finalUrl).origin;
    const site: Site = { origin };
    const rootUrl = toSiteUrl(root.finalUrl, site) ?? `${origin}/`;

    const robotsTxt = await fetchRobotsTxt(origin);
    const robots = parseRobots(robotsTxt);

    const { error: updateError } = await supabase
      .from("website_sources")
      .update({ canonical_origin: origin, robots_txt: robotsTxt })
      .eq("id", sourceId);
    if (updateError) throw new Error(updateError.message);

    // Remove leftovers of earlier runs (a cancelled or crashed run).
    await supabase.from("website_sync_queue").delete().eq("source_id", sourceId).lt("run", run);

    const sitemapUrls = new Set<string>();
    for (const raw of [...robots.sitemaps, `${origin}/sitemap.xml`]) {
      const url = toSiteUrl(raw, site);
      if (url) sitemapUrls.add(url);
    }

    const rows = [
      ...[...sitemapUrls].slice(0, MAX_SITEMAPS_PER_RUN).map((url) => ({
        source_id: sourceId,
        run,
        url,
        kind: "sitemap",
        depth: 0,
        priority: 0,
      })),
      { source_id: sourceId, run, url: rootUrl, kind: "page", depth: 0, priority: 1 },
    ];
    const { error: seedError } = await supabase
      .from("website_sync_queue")
      .upsert(rows, { onConflict: "source_id,run,url", ignoreDuplicates: true });
    if (seedError) throw new Error(seedError.message);

    return { started: true, run };
  } catch (err) {
    const message = errorMessage(err);
    await supabase
      .from("website_sources")
      .update({
        last_sync_status: "error",
        last_sync_error: message,
        last_sync_finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceId);
    return { started: false, reason: "error", error: message };
  }
}

/**
 * robots.txt per RFC 9309: a 4xx means no rules (crawl freely); a 5xx or an
 * unreachable server means "assume everything is disallowed" for this run.
 */
async function fetchRobotsTxt(origin: string): Promise<string> {
  try {
    const res = await politeFetch(`${origin}/robots.txt`, {
      accept: "text/plain,*/*;q=0.5",
      maxBytes: () => 512 * 1024,
    });
    if (res.status >= 200 && res.status < 300) return res.body?.toString("utf8") ?? "";
    if (res.status >= 400 && res.status < 500) return "";
  } catch {
    // fall through
  }
  return "User-agent: *\nDisallow: /\n";
}

/** Start runs for enabled sources whose last run began long enough ago. */
export async function startDueWebsiteSyncs(now = Date.now()): Promise<StartResult[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("website_sources")
    .select("id, last_sync_status, last_sync_started_at")
    .eq("enabled", true);
  if (error) throw new Error(error.message);

  const due = (data ?? []).filter(
    (s) =>
      s.last_sync_status !== "running" &&
      (!s.last_sync_started_at ||
        now - new Date(s.last_sync_started_at).getTime() >= RESYNC_INTERVAL_MS)
  );

  const results: StartResult[] = [];
  for (const source of due) results.push(await startWebsiteSync(source.id));
  return results;
}

// ── Running batches ──────────────────────────────────────────────────────────

export interface BatchSummary {
  sources: number;
  processed: number;
  finalized: string[];
  stoppedForTime: boolean;
}

/**
 * Work the queues of running sources until the time budget is spent. Sources
 * are interleaved: whichever source's crawl delay expires first goes next, so
 * one slow site doesn't idle the batch. Safe to call when nothing is queued
 * (one cheap query).
 */
export async function runWebsiteSyncBatch(options: {
  timeBudgetMs?: number;
  sourceIds?: string[];
} = {}): Promise<BatchSummary> {
  const deadline = Date.now() + (options.timeBudgetMs ?? 240_000);
  const supabase = createAdminClient();
  const summary: BatchSummary = { sources: 0, processed: 0, finalized: [], stoppedForTime: false };

  let query = supabase
    .from("website_sources")
    .select("*")
    .eq("last_sync_status", "running")
    .eq("enabled", true)
    .order("last_sync_started_at", { ascending: true })
    .limit(MAX_SOURCES_PER_BATCH);
  if (options.sourceIds?.length) query = query.in("id", options.sourceIds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const sources = (data ?? []) as WebsiteSourceRow[];
  if (!sources.length) return summary;

  const states: SourceState[] = [];
  for (const source of sources) {
    if (await claimLease(supabase, source.id, deadline + LEASE_GRACE_MS)) {
      states.push(await initState(supabase, source));
    }
  }
  summary.sources = states.length;

  try {
    while (true) {
      const active = states.filter((s) => !s.finished);
      if (!active.length) break;

      const next = active.reduce((a, b) => (b.nextFetchAt < a.nextFetchAt ? b : a));
      const now = Date.now();
      const startAt = Math.max(now, next.nextFetchAt);
      if (deadline - startAt < ITEM_RESERVE_MS) {
        summary.stoppedForTime = true;
        break;
      }
      if (startAt > now) await sleep(startAt - now);

      const item = await nextItem(supabase, next);
      if (!item) {
        await finalizeRun(supabase, next);
        next.finished = true;
        summary.finalized.push(next.source.id);
        continue;
      }

      await processItem(supabase, next, item);
      summary.processed++;
    }
  } finally {
    await Promise.all(
      states.map((s) =>
        supabase.from("website_sources").update({ lease_until: null }).eq("id", s.source.id)
      )
    );
  }

  return summary;
}

async function claimLease(supabase: Db, sourceId: string, until: number): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("website_sources")
    .update({ lease_until: new Date(until).toISOString() })
    .eq("id", sourceId)
    .or(`lease_until.is.null,lease_until.lt."${nowIso}"`)
    .select("id");
  return !!data?.length;
}

async function initState(supabase: Db, source: WebsiteSourceRow): Promise<SourceState> {
  const run = source.current_run;
  const robots = parseRobots(source.robots_txt);
  const [{ count: seen }, { count: queued }, { count: sitemaps }] = await Promise.all([
    supabase
      .from("website_pages")
      .select("id", { count: "exact", head: true })
      .eq("source_id", source.id)
      .eq("last_seen_run", run),
    supabase
      .from("website_sync_queue")
      .select("id", { count: "exact", head: true })
      .eq("source_id", source.id)
      .eq("run", run)
      .eq("kind", "page"),
    supabase
      .from("website_sync_queue")
      .select("id", { count: "exact", head: true })
      .eq("source_id", source.id)
      .eq("run", run)
      .eq("kind", "sitemap"),
  ]);
  return {
    source,
    run,
    site: siteOf(source),
    robots,
    delayMs: crawlDelayMs(robots),
    nextFetchAt: 0,
    seenThisRun: seen ?? 0,
    queued: queued ?? 0,
    sitemapsQueued: sitemaps ?? 0,
    buffer: [],
    finished: false,
  };
}

async function nextItem(supabase: Db, state: SourceState): Promise<QueueItem | null> {
  if (!state.buffer.length) {
    const { data, error } = await supabase
      .from("website_sync_queue")
      .select("id, url, kind, depth, attempts")
      .eq("source_id", state.source.id)
      .eq("run", state.run)
      .eq("status", "pending")
      .order("priority", { ascending: true })
      .order("id", { ascending: true })
      .limit(20);
    if (error) throw new Error(error.message);
    state.buffer = (data ?? []) as QueueItem[];
  }
  return state.buffer.shift() ?? null;
}

async function markItem(
  supabase: Db,
  itemId: number,
  status: "done" | "skipped" | "error",
  error: string | null = null
): Promise<void> {
  await supabase
    .from("website_sync_queue")
    .update({ status, error, processed_at: new Date().toISOString() })
    .eq("id", itemId);
}

/** Mark a URL handled for this run without fetching it (e.g. reached via redirect). */
async function markUrlDone(supabase: Db, state: SourceState, url: string): Promise<void> {
  state.buffer = state.buffer.filter((item) => item.url !== url);
  await supabase.from("website_sync_queue").upsert(
    {
      source_id: state.source.id,
      run: state.run,
      url,
      kind: "page",
      status: "done",
      processed_at: new Date().toISOString(),
    },
    { onConflict: "source_id,run,url" }
  );
}

interface Discovered {
  url: string;
  kind: "page" | "sitemap";
  depth: number;
}

/** Add same-site, allowed URLs to the run's queue, within the caps. */
async function enqueue(supabase: Db, state: SourceState, found: Discovered[]): Promise<void> {
  const filter = {
    include: state.source.include_patterns ?? [],
    exclude: state.source.exclude_patterns ?? [],
  };
  const cap = state.source.max_pages * QUEUE_CAP_MULTIPLIER;
  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const entry of found) {
    const url = toSiteUrl(entry.url, state.site);
    if (!url || seen.has(url)) continue;
    if (!isAllowedByRobots(state.robots, url)) continue;
    if (entry.kind === "sitemap") {
      if (state.sitemapsQueued + rows.filter((r) => r.kind === "sitemap").length >= MAX_SITEMAPS_PER_RUN) continue;
    } else {
      if (entry.depth > MAX_DEPTH) continue;
      if (!filterUrl(url, filter).allowed) continue;
      if (state.queued + rows.filter((r) => r.kind === "page").length >= cap) continue;
    }
    seen.add(url);
    rows.push({
      source_id: state.source.id,
      run: state.run,
      url,
      kind: entry.kind,
      depth: entry.depth,
      priority: entry.kind === "sitemap" ? 0 : entry.depth + 1,
    });
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await supabase
      .from("website_sync_queue")
      .upsert(rows.slice(i, i + 500), { onConflict: "source_id,run,url", ignoreDuplicates: true })
      .select("kind");
    if (error) throw new Error(`Queueing URLs failed: ${error.message}`);
    for (const row of data ?? []) {
      if (row.kind === "sitemap") state.sitemapsQueued++;
      else state.queued++;
    }
  }
}

async function loadPage(supabase: Db, sourceId: string, url: string): Promise<PageRow | null> {
  const { data } = await supabase
    .from("website_pages")
    .select("id, url, content_hash, etag, last_modified, document_id, links, last_seen_run, missing_count")
    .eq("source_id", sourceId)
    .eq("url", url)
    .maybeSingle<PageRow>();
  return data ?? null;
}

/** The page was reached this run (or is only transiently failing): keep it. */
async function markSeen(
  supabase: Db,
  state: SourceState,
  page: PageRow,
  httpStatus: number | null
): Promise<void> {
  if (page.last_seen_run !== state.run) state.seenThisRun++;
  await supabase
    .from("website_pages")
    .update({
      last_seen_at: new Date().toISOString(),
      last_seen_run: state.run,
      missing_count: 0,
      ...(httpStatus != null ? { http_status: httpStatus } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", page.id);
}

async function deletePage(supabase: Db, page: Pick<PageRow, "id" | "document_id">): Promise<void> {
  if (page.document_id) await deleteWebsiteDocuments(supabase, [page.document_id]);
  await supabase.from("website_pages").delete().eq("id", page.id);
}

async function processItem(supabase: Db, state: SourceState, item: QueueItem): Promise<void> {
  if (item.attempts >= MAX_ATTEMPTS) {
    await markItem(supabase, item.id, "error", "Gave up after repeated failures");
    return;
  }
  await supabase
    .from("website_sync_queue")
    .update({ attempts: item.attempts + 1 })
    .eq("id", item.id);

  try {
    if (item.kind === "sitemap") await processSitemap(supabase, state, item);
    else await processPage(supabase, state, item);
  } catch (err) {
    const message = errorMessage(err).slice(0, 500);
    console.warn(`[website] ${item.url}: ${message}`);
    // A network failure isn't evidence the page is gone: keep what we have.
    if (item.kind === "page") {
      const existing = await loadPage(supabase, state.source.id, item.url);
      if (existing) await markSeen(supabase, state, existing, null);
    }
    await markItem(supabase, item.id, "error", message);
  }
}

async function processSitemap(supabase: Db, state: SourceState, item: QueueItem): Promise<void> {
  state.nextFetchAt = Date.now() + state.delayMs;
  const res = await politeFetch(item.url, {
    accept: "application/xml,text/xml,*/*;q=0.5",
    maxBytes: () => MAX_SITEMAP_BYTES,
  });
  if (!res.body || res.status < 200 || res.status >= 300) {
    // A missing /sitemap.xml is normal; the link crawl covers the site.
    await markItem(supabase, item.id, "skipped", `HTTP ${res.status}`);
    return;
  }
  const parsed = parseSitemap(sitemapBodyToText(res.body));
  await enqueue(supabase, state, [
    ...parsed.sitemaps.map((url) => ({ url, kind: "sitemap" as const, depth: 0 })),
    ...parsed.urls.map((url) => ({ url, kind: "page" as const, depth: 1 })),
  ]);
  await markItem(supabase, item.id, "done");
}

async function processPage(supabase: Db, state: SourceState, item: QueueItem): Promise<void> {
  const { source } = state;
  const filter = { include: source.include_patterns ?? [], exclude: source.exclude_patterns ?? [] };
  const isRoot = item.depth === 0;
  // The root is always crawled (for its links), even when include patterns
  // leave it out; whether it is indexed is decided further down.
  const crawlable = (url: string) =>
    filterUrl(url, isRoot ? { ...filter, include: [] } : filter).allowed &&
    isAllowedByRobots(state.robots, url);

  if (!isAllowedByRobots(state.robots, item.url)) {
    await markItem(supabase, item.id, "skipped", "Disallowed by robots.txt");
    return;
  }
  if (state.seenThisRun >= source.max_pages) {
    // Skip everything left in one go; sitemaps no longer matter either.
    await supabase
      .from("website_sync_queue")
      .update({ status: "skipped", error: "Page limit reached", processed_at: new Date().toISOString() })
      .eq("source_id", source.id)
      .eq("run", state.run)
      .eq("status", "pending");
    state.buffer = [];
    return;
  }

  const requested = await loadPage(supabase, source.id, item.url);
  state.nextFetchAt = Date.now() + state.delayMs;
  const res = await politeFetch(item.url, {
    headers: conditionalHeaders(requested),
    maxBytes: (contentType) =>
      looksLikePdf(item.url) && /octet-stream/i.test(contentType)
        ? MAX_PDF_BYTES
        : capForContentType(contentType),
  });

  const outcome = classifyStatus(res.status);

  if (outcome === "not_modified" && requested) {
    await markSeen(supabase, state, requested, 304);
    await enqueue(
      supabase,
      state,
      (requested.links ?? []).map((url) => ({ url, kind: "page" as const, depth: item.depth + 1 }))
    );
    await markItem(supabase, item.id, "done");
    return;
  }

  if (outcome === "gone") {
    if (requested) await deletePage(supabase, requested);
    await markItem(supabase, item.id, "done", `HTTP ${res.status}`);
    return;
  }

  if (outcome !== "ok") {
    // Server trouble or rate limiting is transient; keep the page. Other
    // client errors (401/403 — the page went private) let it age out.
    if (requested && (res.status >= 500 || res.status === 429)) {
      await markSeen(supabase, state, requested, res.status);
    }
    await markItem(supabase, item.id, "error", `HTTP ${res.status}`);
    return;
  }

  // Redirected within the site: the content belongs to the final URL.
  let pageUrl = toSiteUrl(res.finalUrl, state.site);
  if (!pageUrl) {
    await markItem(supabase, item.id, "skipped", "Redirected off-site");
    return;
  }
  if (pageUrl !== item.url) {
    if (!crawlable(pageUrl)) {
      await markItem(supabase, item.id, "skipped", "Redirected to an excluded URL");
      return;
    }
    await markUrlDone(supabase, state, pageUrl);
  }

  if (!res.body) {
    await markItem(supabase, item.id, "skipped", "Unsupported content type");
    return;
  }

  const contentType = res.headers.get("content-type") ?? "";
  const kind: PageKind =
    isPdfContentType(contentType) || (looksLikePdf(pageUrl) && !isHtmlContentType(contentType))
      ? "pdf"
      : "html";

  let title: string;
  let hash: string;
  let documentBody: Buffer | null;
  let links: string[] = [];

  if (kind === "pdf") {
    title = pdfTitleFromUrl(pageUrl);
    hash = sha256(res.body);
    documentBody = res.body;
  } else {
    const extracted = extractPage(decodeHtml(res.body, contentType), pageUrl, state.site);
    links = extracted.links;
    await enqueue(
      supabase,
      state,
      links.map((url) => ({ url, kind: "page" as const, depth: item.depth + 1 }))
    );

    // rel=canonical within the site: index the content under that URL once.
    const canonical = extracted.canonicalUrl;
    if (canonical && canonical !== pageUrl && crawlable(canonical)) {
      pageUrl = canonical;
      await markUrlDone(supabase, state, pageUrl);
    }

    title = extracted.title;
    hash = htmlContentHash(extracted.title, extracted.text);
    const indexable =
      !extracted.noindex &&
      extracted.text.length >= MIN_INGEST_CHARS &&
      (!isRoot || filterUrl(pageUrl, filter).allowed);
    documentBody = indexable
      ? Buffer.from(pageDocumentText(extracted.title, pageUrl, extracted.text), "utf8")
      : null;
  }

  const existing = pageUrl === item.url ? requested : await loadPage(supabase, source.id, pageUrl);
  if (existing?.last_seen_run === state.run) {
    // Another URL already resolved to this page in this run.
    await markItem(supabase, item.id, "done", "Duplicate of an already-synced page");
    return;
  }

  let documentId = existing?.document_id ?? null;
  let contentHash: string | null = existing?.content_hash ?? null;
  let processingError: string | null = null;
  let createdDocumentId: string | null = null;

  if (!documentBody) {
    // Nothing worth indexing (noindex, near-empty, or an excluded root).
    if (documentId) await deleteWebsiteDocuments(supabase, [documentId]);
    documentId = null;
    contentHash = hash;
  } else if (needsReingest(existing, hash)) {
    try {
      const result = await upsertWebsiteDocument(supabase, {
        schoolId: source.school_id,
        sourceId: source.id,
        url: pageUrl,
        title,
        kind,
        body: documentBody,
        existingDocumentId: documentId,
      });
      documentId = result.documentId;
      if (result.created) createdDocumentId = result.documentId;
      contentHash = hash;
    } catch (err) {
      processingError = errorMessage(err);
      // Keep the hash unset so the next sync tries again.
      contentHash = null;
      const fresh = await supabase
        .from("documents")
        .select("id")
        .eq("source", "website")
        .eq("source_url", pageUrl)
        .eq("school_id", source.school_id)
        .limit(1);
      documentId = (fresh.data?.[0]?.id as string | undefined) ?? documentId;
    }
  }

  const now = new Date().toISOString();
  const { error: pageError } = await supabase.from("website_pages").upsert(
    {
      source_id: source.id,
      school_id: source.school_id,
      url: pageUrl,
      kind,
      title,
      content_hash: contentHash,
      etag: res.headers.get("etag"),
      last_modified: res.headers.get("last-modified"),
      http_status: res.status,
      links,
      last_seen_at: now,
      last_seen_run: state.run,
      missing_count: 0,
      document_id: documentId,
      updated_at: now,
    },
    { onConflict: "source_id,url" }
  );
  if (pageError) {
    // Most likely the source was deleted mid-run: don't leave an orphan.
    if (createdDocumentId) await deleteWebsiteDocuments(supabase, [createdDocumentId]);
    throw new Error(`Saving page failed: ${pageError.message}`);
  }
  state.seenThisRun++;

  if (processingError) {
    await markItem(supabase, item.id, "error", `Processing failed: ${processingError}`.slice(0, 500));
  } else {
    await markItem(supabase, item.id, "done");
  }
}

// ── Finishing a run ──────────────────────────────────────────────────────────

async function finalizeRun(supabase: Db, state: SourceState): Promise<void> {
  const { source, run } = state;

  const { count: seenCount } = await supabase
    .from("website_pages")
    .select("id", { count: "exact", head: true })
    .eq("source_id", source.id)
    .eq("last_seen_run", run);
  const seen = seenCount ?? 0;

  const apply = shouldApplyMissing(seen, source.page_count, source.max_pages);
  if (apply) {
    const { data: missing } = await supabase
      .from("website_pages")
      .select("id, document_id, missing_count")
      .eq("source_id", source.id)
      .or(`last_seen_run.is.null,last_seen_run.lt.${run}`);

    for (const page of missing ?? []) {
      const next = nextMissingState(page.missing_count as number);
      try {
        if (next.remove) {
          await deletePage(supabase, { id: page.id as string, document_id: page.document_id as string | null });
        } else {
          await supabase
            .from("website_pages")
            .update({ missing_count: next.missingCount, updated_at: new Date().toISOString() })
            .eq("id", page.id);
        }
      } catch (err) {
        console.warn(`[website] Removing missing page ${page.id} failed: ${errorMessage(err)}`);
      }
    }
  }

  const { count: total } = await supabase
    .from("website_pages")
    .select("id", { count: "exact", head: true })
    .eq("source_id", source.id)
    .not("document_id", "is", null);

  let status: "success" | "partial" | "error" = "success";
  let error: string | null = null;
  if (seen === 0) {
    const { data: firstError } = await supabase
      .from("website_sync_queue")
      .select("url, error")
      .eq("source_id", source.id)
      .eq("run", run)
      .in("status", ["error", "skipped"])
      .eq("kind", "page")
      .order("id", { ascending: true })
      .limit(1);
    status = "error";
    error = firstError?.[0]
      ? `No pages could be synced (${firstError[0].url}: ${firstError[0].error ?? "skipped"}).`
      : "No pages could be synced.";
  } else if (!apply) {
    status = "partial";
    error = `Only ${seen} pages were reached (previously ${source.page_count}), so missing pages were kept.`;
  }

  const finishedAt = new Date().toISOString();
  await supabase
    .from("website_sources")
    .update({
      last_sync_status: status,
      last_sync_error: error,
      last_sync_finished_at: finishedAt,
      page_count: total ?? 0,
      sync_count: source.sync_count + 1,
      updated_at: finishedAt,
    })
    .eq("id", source.id)
    .eq("current_run", run);

  await supabase.from("website_sync_queue").delete().eq("source_id", source.id).lte("run", run);
}
