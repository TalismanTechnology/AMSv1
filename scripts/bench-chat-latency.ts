/**
 * Mock-based latency benchmark for the chat pipeline's pre-first-token path.
 *
 *   npx tsx scripts/bench-chat-latency.ts [--auth=40] [--db=40] [--embed=120]
 *     [--rewrite=600] [--search=80] [--model=400] [--trace]
 *
 * Never touches the network and needs no env vars: every latency below is a
 * timer, and the real-code run swaps globalThis.fetch for a stub that rejects
 * anything it doesn't recognise.
 *
 * Two measurements per scenario (first question / follow-up):
 *
 * 1. MODELLED old vs new — the await graph of app/api/chat/route.ts +
 *    lib/ai/chat-turn.ts before and after the latency work, written out as
 *    timers. The old code no longer exists to run, so both graphs are modelled
 *    from the source; each step names the call it stands for. Keyword search
 *    fires its per-term RPCs in parallel, so it costs one `search`.
 *
 * 2. REAL new — runs the actual fetchChildrenForContext + prepareChatTurn
 *    (rewrite, embedding, hybrid retrieval, passage assembly, prompt build)
 *    against a fetch stub that answers Supabase PostgREST and Gemini requests
 *    after the configured latency. Only the route's auth prefix (getUser, then
 *    profile ‖ membership, overlapping the real children read) is modelled,
 *    since it needs a Next request context.
 *
 * `--model` is the answer model's own time to first token, added to every row
 * so the totals read as estimated TTFT; set it to 0 for pipeline time alone.
 */

// Module scope (the pipeline is loaded with dynamic import once env is set).
export {};

type Latencies = {
  auth: number; // supabase.auth.getUser() — a call to Supabase Auth
  db: number; // one PostgREST table read
  embed: number; // Gemini embedContent
  rewrite: number; // Gemini generateContent for the follow-up rewrite
  search: number; // one pgvector / full-text RPC
  model: number; // answer model's time to first token
};

const DEFAULTS: Latencies = { auth: 40, db: 40, embed: 120, rewrite: 600, search: 80, model: 400 };

function parseArgs(argv: string[]): { lat: Latencies; trace: boolean } {
  const lat = { ...DEFAULTS };
  let trace = false;
  for (const arg of argv) {
    if (arg === "--trace") {
      trace = true;
      continue;
    }
    const m = /^--(\w+)=(\d+(?:\.\d+)?)$/.exec(arg);
    if (!m || !(m[1] in lat)) {
      console.error(`Unknown argument: ${arg}\nKnown: ${Object.keys(DEFAULTS).map((k) => `--${k}=<ms>`).join(" ")} --trace`);
      process.exit(1);
    }
    lat[m[1] as keyof Latencies] = Number(m[2]);
  }
  return { lat, trace };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 1. Modelled await graphs
// ---------------------------------------------------------------------------

/** Before: every access check and the children read in series; doc info, then neighbours. */
async function oldPipeline(l: Latencies, followUp: boolean): Promise<void> {
  await sleep(l.auth); // getUser()
  await sleep(l.db); // profiles (role + consent)
  await sleep(l.db); // school_memberships
  const children = sleep(l.db); // fetchChildrenForContext (started as prepareChatTurn's argument)
  const rest = Promise.all([sleep(l.db), sleep(l.db), sleep(l.db)]); // events, announcements, settings
  await children;
  if (followUp) await sleep(l.rewrite); // rewriteQueryWithContext
  await Promise.all([
    (async () => {
      await sleep(l.embed); // searchDocuments: generateEmbedding
      await sleep(l.search); // match_document_chunks
      await sleep(l.db); // documents (title, divisions…)
    })(),
    sleep(l.search), // keywordSearchChunks (per-term RPCs in parallel)
  ]);
  await rest;
  await sleep(l.db); // buildCitablePassages: neighbouring document_chunks
}

/**
 * After: the user's own children read overlaps the access checks; school-wide
 * context starts once they pass; doc info and neighbours fetched together.
 */
async function newPipeline(l: Latencies, followUp: boolean): Promise<void> {
  await sleep(l.auth); // getUser() (body parsed meanwhile)
  const children = sleep(l.db); // fetchChildrenForContext, started before the checks
  await Promise.all([sleep(l.db), sleep(l.db)]); // profiles ‖ school_memberships
  const rest = Promise.all([sleep(l.db), sleep(l.db), sleep(l.db)]); // prepareChatTurn: events, announcements, settings
  await children;
  if (followUp) await sleep(l.rewrite); // rewriteQueryWithContext
  await Promise.all([
    (async () => {
      await sleep(l.embed); // matchDocumentChunks: generateEmbedding
      await sleep(l.search); // match_document_chunks
    })(),
    sleep(l.search), // keywordSearchChunks
  ]);
  await Promise.all([sleep(l.db), sleep(l.db)]); // attachDocumentInfo ‖ fetchPassageChunks
  await rest;
}

// ---------------------------------------------------------------------------
// 2. The real prepareChatTurn against a fetch stub
// ---------------------------------------------------------------------------

const SUPABASE_URL = "http://bench.supabase.invalid";
const SCHOOL_ID = "00000000-0000-0000-0000-000000000001";

type TraceEntry = { label: string; start: number; end: number };

function installFetchStub(l: Latencies, t0: () => number, trace: TraceEntry[]) {
  const json = (body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json", ...headers },
    });

  const chunk = (chunk_index: number, content: string, similarity: number) => ({
    id: `chunk-${chunk_index}`,
    document_id: "doc-1",
    chunk_index,
    content,
    metadata: { page: 1 },
    similarity,
  });

  const respond = (url: URL): { ms: number; label: string; res: () => Response } => {
    if (url.origin === SUPABASE_URL) {
      const path = url.pathname;
      if (path === "/rest/v1/rpc/match_document_chunks") {
        return {
          ms: l.search,
          label: "rpc match_document_chunks",
          res: () => json([chunk(2, "Pickup is at 3:15 PM, except Wednesdays at 1:30 PM.", 0.82)]),
        };
      }
      if (path === "/rest/v1/rpc/search_document_chunks") {
        return { ms: l.search, label: "rpc search_document_chunks", res: () => json([]) };
      }
      const table = path.replace("/rest/v1/", "");
      // settings is read with .single(), so it answers with one object.
      const rows: Record<string, unknown> = {
        children: [],
        events: [],
        announcements: [],
        settings: { custom_system_prompt: null, ai_temperature: null },
        documents: [
          {
            id: "doc-1",
            title: "Family Handbook",
            file_url: null,
            file_type: "pdf",
            tags: [],
            category: null,
            folder: null,
            divisions: [],
          },
        ],
        document_chunks: [
          { document_id: "doc-1", chunk_index: 1, content: "Dismissal procedures.", metadata: { page: 1 } },
          { document_id: "doc-1", chunk_index: 3, content: "Late pickup fees apply.", metadata: { page: 1 } },
        ],
      };
      if (table in rows) {
        return {
          ms: l.db,
          label: `select ${table}`,
          res: () => json(rows[table], { "Content-Range": "*/0" }),
        };
      }
    }
    if (url.hostname === "generativelanguage.googleapis.com") {
      if (url.pathname.endsWith(":embedContent")) {
        return {
          ms: l.embed,
          label: "gemini embedContent",
          res: () => json({ embedding: { values: Array.from({ length: 768 }, () => 0.01) } }),
        };
      }
      if (url.pathname.endsWith(":generateContent")) {
        return {
          ms: l.rewrite,
          label: "gemini generateContent (rewrite)",
          res: () =>
            json({
              candidates: [
                {
                  content: { role: "model", parts: [{ text: "What time is pickup on Wednesdays?" }] },
                  finishReason: "STOP",
                  index: 0,
                },
              ],
              usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 8, totalTokenCount: 58 },
            }),
        };
      }
    }
    throw new Error(`bench: blocked unexpected network request to ${url.href}`);
  };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const { ms, label, res } = respond(url);
    const start = t0();
    await sleep(ms);
    trace.push({ label, start, end: t0() });
    return res();
  }) as typeof fetch;
}

async function realNewPipeline(l: Latencies, followUp: boolean) {
  const { prepareChatTurn } = await import("@/lib/ai/chat-turn");
  const { fetchChildrenForContext } = await import("@/lib/ai/context");

  const messages = (
    followUp
      ? [
          { role: "user", text: "When is pickup?" },
          { role: "assistant", text: "Pickup is at 3:15 PM [1]." },
          { role: "user", text: "What about Wednesdays?" },
        ]
      : [{ role: "user", text: "When is pickup?" }]
  ).map((m, i) => ({
    id: `m${i}`,
    role: m.role as "user" | "assistant",
    parts: [{ type: "text" as const, text: m.text }],
  }));
  const lastMessageText = messages[messages.length - 1].parts[0].text;

  // Route prefix (modelled — needs a Next request): getUser, then the user's
  // own children read starts while profile ‖ membership are checked. The
  // school-wide reads start inside prepareChatTurn, after the checks.
  await sleep(l.auth);
  const children = fetchChildrenForContext("user-1", SCHOOL_ID);
  children.catch(() => {});
  await Promise.all([sleep(l.db), sleep(l.db)]);

  const turn = await prepareChatTurn({ messages, lastMessageText, schoolId: SCHOOL_ID, children });
  if (turn.sources.length === 0) throw new Error("bench: real pipeline produced no sources — stub mismatch");
  if (followUp && turn.searchQuery === lastMessageText) {
    throw new Error("bench: follow-up was not rewritten — stub mismatch");
  }
  return turn;
}

// ---------------------------------------------------------------------------

async function time(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

async function main() {
  const { lat, trace: showTrace } = parseArgs(process.argv.slice(2));

  // Point every client at unroutable fakes; the fetch stub answers instead.
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "bench-service-role-key";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "bench-google-key";

  // Load the pipeline's modules up front so the first timed run doesn't pay
  // for module evaluation.
  await import("@/lib/ai/chat-turn");
  await import("@/lib/ai/context");

  let traceStart = 0;
  const trace: TraceEntry[] = [];
  installFetchStub(lat, () => performance.now() - traceStart, trace);
  // One untimed pass so first-call JIT and client setup don't land in a row.
  await realNewPipeline(lat, true);

  console.log(
    `Latencies (ms): auth=${lat.auth} db=${lat.db} embed=${lat.embed} rewrite=${lat.rewrite} search=${lat.search} model-ttft=${lat.model}\n`
  );

  const rows: string[][] = [];
  const traces: { name: string; entries: TraceEntry[] }[] = [];
  for (const [name, followUp] of [
    ["first question", false],
    ["follow-up", true],
  ] as const) {
    const oldMs = await time(() => oldPipeline(lat, followUp));
    const newMs = await time(() => newPipeline(lat, followUp));
    trace.length = 0;
    traceStart = performance.now();
    const realMs = await time(() => realNewPipeline(lat, followUp));
    traces.push({ name, entries: [...trace] });

    const fmt = (ms: number) => `${Math.round(ms + lat.model)} ms`;
    rows.push([
      name,
      fmt(oldMs),
      fmt(newMs),
      fmt(realMs),
      `-${Math.round(oldMs - newMs)} ms (${Math.round(((oldMs - newMs) / (oldMs + lat.model)) * 100)}%)`,
    ]);
  }

  const header = ["scenario", "OLD (modelled)", "NEW (modelled)", "NEW (real code)", "saved"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log("Estimated time to first token:");
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  rows.forEach((r) => console.log(line(r)));
  console.log(
    "\nNEW (real code) runs the actual fetchChildrenForContext + prepareChatTurn against stubbed fetch;" +
      "\nonly the route's auth prefix is modelled. Timer jitter adds a few ms per hop."
  );

  if (showTrace) {
    for (const { name, entries } of traces) {
      console.log(`\nReal-code network trace — ${name} (ms from start of prepareChatTurn's caller):`);
      for (const e of entries.sort((a, b) => a.start - b.start)) {
        console.log(`  ${String(Math.round(e.start)).padStart(5)} → ${String(Math.round(e.end)).padStart(5)}  ${e.label}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
