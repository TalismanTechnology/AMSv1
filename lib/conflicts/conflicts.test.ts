import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterCandidates,
  indexReviewedConflicts,
  isReviewedConflict,
  normalizeForComparison,
  pairKey,
  type CandidateDocument,
  type CandidatePair,
  type ReviewedConflict,
} from "./candidates";
import { nearestCrossDocumentPairs, normalizeVector, parseEmbedding, type EmbeddedChunk } from "./knn";
import { excerptAround, findQuoteRange, quoteAppearsIn, storedExcerpt } from "./quotes";
import { verdictFor, buildJudgePrompt, hasPlaceholder, MIN_CONFLICT_CONFIDENCE, type Judgment, type JudgePair } from "./judge";
import { applyVerification, buildVerifyPrompt, needsVerification } from "./verify";
import {
  CLARIFICATION_TITLE,
  MAX_CLARIFICATIONS,
  chunkKey,
  clarificationPassages,
  conflictContext,
  isClarificationId,
  planConflictResolutions,
  withoutDropped,
  type ContextChunk,
  type ResolvedConflict,
  type ResolvedConflictSide,
} from "./resolutions";
import { isRunActive, STALE_RUN_MS, type ScanRunSummary } from "./runs";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { groupSources, MAX_SOURCE_ROWS } from "@/lib/source-groups";
import type { CitablePassage } from "@/lib/ai/rag";
import type { ChatSource } from "@/lib/types";

// ── Candidate filtering ──────────────────────────────────────────────────────

function pair(a: string, b: string, docA: string, docB: string, similarity: number): CandidatePair {
  return { chunk_a_id: a, chunk_b_id: b, document_a_id: docA, document_b_id: docB, similarity };
}

const upload: CandidateDocument = { source: "upload" };
const website: CandidateDocument = { source: "website", source_url: "https://school.org/a" };

function setup(
  docs: Record<string, CandidateDocument>,
  texts: Record<string, string>,
  judged: string[] = []
) {
  return {
    documents: new Map(Object.entries(docs)),
    chunks: new Map(Object.entries(texts).map(([id, content]) => [id, { content }])),
    judged: new Set(judged),
  };
}

test("pair keys ignore which chunk came first", () => {
  assert.equal(pairKey("b", "a"), pairKey("a", "b"));
  assert.equal(pairKey("a", "b"), "a:b");
});

test("orders candidates by similarity and keeps each unordered pair once", () => {
  const ctx = setup({ d1: upload, d2: upload, d3: upload }, { a: "Pickup is at 3:00", b: "Pickup is at 3:15", c: "Pickup at 2:45 on Fridays" });
  const { selected } = filterCandidates(
    [pair("a", "c", "d1", "d3", 0.86), pair("a", "b", "d1", "d2", 0.9), pair("b", "a", "d2", "d1", 0.91)],
    ctx,
    { limit: 10 }
  );
  assert.deepEqual(
    selected.map((s) => [pairKey(s.chunk_a_id, s.chunk_b_id), s.similarity]),
    [["a:b", 0.91], ["a:c", 0.86]]
  );
});

test("skips website-vs-website pairs but keeps a website page against an upload", () => {
  const ctx = setup(
    { w1: website, w2: { source_url: "https://school.org/b" }, u: upload },
    { a: "Tuition is $10,000", b: "Tuition is $12,000", c: "Tuition is $11,000" }
  );
  const { selected, skipped } = filterCandidates(
    [pair("a", "b", "w1", "w2", 0.9), pair("a", "c", "w1", "u", 0.88)],
    ctx,
    { limit: 10 }
  );
  assert.deepEqual(selected.map((s) => s.document_b_id), ["u"]);
  assert.equal(skipped.website_pair, 1);
});

test("skips identical text and near-identical similarity — copies can't disagree", () => {
  const ctx = setup(
    { d1: upload, d2: upload, d3: upload },
    { a: "Drop-off begins at 7:45 AM.", b: "drop off begins at 7:45 am", c: "Drop-off begins at 8:00 AM.", d: "Anything" }
  );
  const { selected, skipped } = filterCandidates(
    [pair("a", "b", "d1", "d2", 0.95), pair("a", "d", "d1", "d3", 0.985), pair("a", "c", "d1", "d3", 0.93)],
    ctx,
    { limit: 10 }
  );
  assert.deepEqual(selected.map((s) => s.chunk_b_id), ["c"]);
  assert.equal(skipped.identical, 2);
  assert.equal(normalizeForComparison("Drop-off  begins!"), "drop off begins");
});

test("skips pairs already judged in any status, and same-document pairs", () => {
  const ctx = setup({ d1: upload, d2: upload }, { a: "x one", b: "x two", c: "x three" }, [pairKey("b", "a")]);
  const { selected, skipped } = filterCandidates(
    [pair("a", "b", "d1", "d2", 0.9), pair("a", "c", "d1", "d1", 0.9)],
    ctx,
    { limit: 10 }
  );
  assert.equal(selected.length, 0);
  assert.equal(skipped.already_judged, 1);
  assert.equal(skipped.same_document, 1);
});

test("caps pairs per document pair so one pair of documents can't take the budget", () => {
  const texts: Record<string, string> = {};
  const candidates: CandidatePair[] = [];
  for (let i = 0; i < 5; i++) {
    texts[`a${i}`] = `handbook passage ${i}`;
    texts[`b${i}`] = `older handbook passage ${i} differs`;
    candidates.push(pair(`a${i}`, `b${i}`, "h2025", "h2024", 0.95 - i * 0.01));
  }
  texts.x = "Lunch costs $5";
  texts.y = "Lunch costs $6";
  candidates.push(pair("x", "y", "menu", "letter", 0.86));
  const ctx = setup({ h2025: upload, h2024: upload, menu: upload, letter: upload }, texts);

  const { selected, skipped } = filterCandidates(candidates, ctx, { limit: 10, maxPerDocumentPair: 2 });
  assert.deepEqual(selected.map((s) => s.chunk_a_id), ["a0", "a1", "x"]);
  assert.equal(skipped.document_pair_cap, 3);
});

test("stops at the limit, keeping the most similar pairs", () => {
  const ctx = setup({ d1: upload, d2: upload, d3: upload, d4: upload }, { a: "one", b: "two", c: "three", d: "four" });
  const { selected, skipped } = filterCandidates(
    [pair("a", "b", "d1", "d2", 0.86), pair("c", "d", "d3", "d4", 0.92), pair("a", "d", "d1", "d4", 0.9)],
    ctx,
    { limit: 2 }
  );
  assert.deepEqual(selected.map((s) => s.similarity), [0.92, 0.9]);
  assert.equal(skipped.over_limit, 1);
});

test("skips pairs whose text couldn't be loaded", () => {
  const ctx = setup({ d1: upload, d2: upload }, { a: "text" });
  const { selected, skipped } = filterCandidates([pair("a", "b", "d1", "d2", 0.9)], ctx, { limit: 5 });
  assert.equal(selected.length, 0);
  assert.equal(skipped.missing_text, 1);
});

// ── Quote verification ───────────────────────────────────────────────────────

test("finds a quote despite different spacing, case and quote marks", () => {
  const chunk = "Carpool\n pickup begins at   3:15 PM for\tLower School. Don’t park on Elm St.";
  assert.equal(quoteAppearsIn("pickup begins at 3:15 PM for Lower School", chunk), true);
  assert.equal(quoteAppearsIn("Don't park on Elm St.", chunk), true);
  assert.equal(quoteAppearsIn('"Carpool pickup begins at 3:15 PM"', chunk), true);
});

test("rejects quotes that aren't in the chunk, or are too short to mean anything", () => {
  const chunk = "Carpool pickup begins at 3:15 PM.";
  assert.equal(quoteAppearsIn("pickup begins at 3:30 PM", chunk), false);
  assert.equal(quoteAppearsIn("pickup … 3:15 PM", chunk), false);
  assert.equal(quoteAppearsIn("3", chunk), false);
  assert.equal(quoteAppearsIn("", chunk), false);
});

test("locates a quote in the original text for highlighting", () => {
  const text = "Intro. Carpool\n pickup begins at 3:15 PM. Outro.";
  const range = findQuoteRange("pickup begins at 3:15 pm", text);
  assert.ok(range);
  assert.equal(text.slice(...range).replace(/\s+/g, " "), "pickup begins at 3:15 PM");
});

test("excerpts a window around the quote, marking what was clipped", () => {
  const text = `${"lorem ipsum ".repeat(60)}The fee is $40 per term. ${"dolor sit ".repeat(60)}`;
  const ex = excerptAround(text, "The fee is $40 per term.", 50);
  assert.equal(ex.match, "The fee is $40 per term.");
  assert.ok(ex.clippedStart && ex.clippedEnd);
  assert.ok(ex.before.length <= 60 && ex.after.length <= 60);

  const missing = excerptAround("Short text.", "not there");
  assert.deepEqual([missing.before, missing.match, missing.after], ["", "", "Short text."]);
});

// ── Judgments ────────────────────────────────────────────────────────────────

const conflict = (over: Partial<Judgment> = {}): Judgment => ({
  is_conflict: true,
  topic: "Pickup time",
  description: "A says 3:00, B says 3:15.",
  statement_a: "Pickup is at 3:00 PM",
  statement_b: "Pickup is at 3:15 PM",
  confidence: 0.9,
  ...over,
});

test("keeps a confident conflict whose quotes are both real as open", () => {
  const v = verdictFor(conflict(), "Note: Pickup is at 3:00 PM daily.", "Pickup is at 3:15 PM.");
  assert.equal(v.status, "open");
});

test("auto-dismisses non-conflicts, low confidence and unverifiable quotes", () => {
  const a = "Pickup is at 3:00 PM daily.";
  const b = "Pickup is at 3:15 PM.";
  assert.equal(verdictFor(conflict({ is_conflict: false }), a, b).status, "auto_dismissed");
  const low = verdictFor(conflict({ confidence: MIN_CONFLICT_CONFIDENCE - 0.01 }), a, b);
  assert.deepEqual([low.status, low.reason], ["auto_dismissed", "low_confidence"]);
  const invented = verdictFor(conflict({ statement_b: "Pickup is at 3:30 PM" }), a, b);
  assert.deepEqual([invented.status, invented.reason], ["auto_dismissed", "quote_not_found"]);
  // Quotes must come from their own side.
  const swapped = verdictFor(conflict({ statement_a: "Pickup is at 3:15 PM", statement_b: "Pickup is at 3:00 PM" }), a, b);
  assert.equal(swapped.status, "auto_dismissed");
});

test("spots placeholder and redacted statements", () => {
  assert.equal(hasPlaceholder("[code redacted — see the school's email]", "x"), true);
  assert.equal(hasPlaceholder("x", "Code: REDACTED"), true);
  assert.equal(hasPlaceholder("Location TBD", "x"), true);
  assert.equal(hasPlaceholder("x", "Details: see the school’s email"), true);
  assert.equal(hasPlaceholder("Fee [waived]", "x"), true);
  assert.equal(hasPlaceholder("Marisol Brekka* Katie Lent", "Marisol Brekka* Katie Lentz*"), false);
  assert.equal(hasPlaceholder("Pickup is at 3:00 PM", ""), false);
});

test("auto-dismisses a confident conflict quoting placeholder text", () => {
  const a = "Your fee waiver code: [code redacted — see the school's email].";
  const b = "Call the Office for a fee waiver code.";
  const v = verdictFor(
    conflict({ statement_a: "[code redacted — see the school's email]", statement_b: "Call the Office for a fee waiver code", confidence: 0.95 }),
    a,
    b
  );
  assert.deepEqual([v.status, v.reason], ["auto_dismissed", "placeholder"]);
  assert.equal(needsVerification(v), false);
});

test("verifier decides whether a judged conflict stays open", () => {
  const judged = verdictFor(conflict(), "Pickup is at 3:00 PM daily.", "Pickup is at 3:15 PM.");
  assert.equal(judged.status, "open");
  assert.equal(needsVerification(judged), true);

  const kept = applyVerification(judged, { verdict: "conflict", reason: "Same pickup, two times.", confidence: 0.9 });
  assert.equal(kept?.status, "open");
  assert.equal(kept?.judgment.description, "A says 3:00, B says 3:15.");

  const unsure = applyVerification(judged, { verdict: "conflict", reason: "Maybe.", confidence: MIN_CONFLICT_CONFIDENCE - 0.01 });
  assert.deepEqual([unsure?.status, unsure?.reason], ["auto_dismissed", "verifier"]);

  const rejected = applyVerification(judged, { verdict: "not_conflict", reason: "Recurring meeting.", confidence: 0.95 });
  assert.deepEqual([rejected?.status, rejected?.reason], ["auto_dismissed", "verifier"]);
  assert.equal(rejected?.judgment.description, "A says 3:00, B says 3:15. Verifier: Recurring meeting.");

  assert.equal(applyVerification(judged, { verdict: "conflict", reason: "", confidence: NaN })?.status, "auto_dismissed");
  // A failed verifier call stores nothing (retried next scan).
  assert.equal(applyVerification(judged, null), null);
});

test("verdicts the judge didn't keep open skip the verifier", () => {
  for (const v of [
    verdictFor(conflict({ is_conflict: false }), "a", "b"),
    verdictFor(conflict({ confidence: 0.5 }), "Pickup is at 3:00 PM", "Pickup is at 3:15 PM"),
  ]) {
    assert.equal(needsVerification(v), false);
    assert.equal(applyVerification(v, null), v);
    assert.equal(applyVerification(v, { verdict: "conflict", reason: "", confidence: 1 }), v);
  }
});

test("prompts carry the recurring-event, periodical and skeptic rules", () => {
  const side = { documentTitle: "Weekly Digest - October 1", documentDates: "", divisions: [], location: null, text: "Jamaa Parent Meeting, Sep 29" };
  const pair: JudgePair = { a: side, b: { ...side, documentTitle: "Weekly Digest - October 29", text: "Jamaa Parent Meeting, Oct 28" } };
  const judgePrompt = buildJudgePrompt([pair]);
  assert.match(judgePrompt, /recurring event/i);
  assert.match(judgePrompt, /issues or editions of a periodical/i);
  const verifyPrompt = buildVerifyPrompt(pair, conflict());
  for (const rule of [/Recurring event/, /issues or editions/, /Opinion or characterization/, /Omitted detail or qualifier/, /Partial lists/, /Placeholder or redacted/, /audiences/]) {
    assert.match(verifyPrompt, rule);
  }
  assert.match(verifyPrompt, /Weekly Digest - October 29/);
});

test("clamps out-of-range confidence", () => {
  assert.equal(verdictFor(conflict({ confidence: 7 }), "Pickup is at 3:00 PM", "Pickup is at 3:15 PM").judgment.confidence, 1);
  assert.equal(verdictFor(conflict({ confidence: NaN }), "x", "y").status, "auto_dismissed");
});

test("the judge prompt carries titles, dates and divisions for each side", () => {
  const prompt = buildJudgePrompt([
    {
      a: { documentTitle: "Handbook 2024", documentDates: "added 2024-08-01", divisions: ["Lower School"], location: "p. 4", text: "Pickup 3:00" },
      b: { documentTitle: "Fall Letter", documentDates: "email sent 2025-09-02", divisions: [], location: null, text: "Pickup 3:15" },
    },
  ]);
  assert.match(prompt, /\[Pair 1\]/);
  assert.match(prompt, /Document: "Handbook 2024" \| Dates: added 2024-08-01 \| Division: Lower School \| Location: p\. 4/);
  assert.match(prompt, /Document: "Fall Letter" \| Dates: email sent 2025-09-02/);
  assert.match(prompt, /NOT conflicts/);
  assert.match(prompt, /subjective characterization or opinion vs a fact/);
  assert.match(prompt, /lists can be cut off/);
  assert.match(prompt, /explicit older year in its title/);
  assert.match(prompt, /Redacted or placeholder text/);
});

// ── Applying resolutions to a turn's chunks ─────────────────────────────────

function sideOf(doc: string, index: number, statement: string, title = doc): ResolvedConflictSide {
  return {
    chunk_id: `${doc}-c${index}`,
    document_id: doc,
    chunk_index: index,
    page: index + 1,
    statement,
    document_title: title,
  };
}

function resolved(over: Partial<ResolvedConflict> = {}): ResolvedConflict {
  return {
    id: "conflict-1",
    status: "resolved",
    resolution: "b_correct",
    admin_note: null,
    resolved_at: "2026-10-01T12:00:00Z",
    a: sideOf("old", 2, "Pickup is at 3:00 PM", "Handbook 2024"),
    b: sideOf("new", 5, "Pickup is at 3:15 PM", "Fall Letter"),
    ...over,
  };
}

/** A context chunk; by default the very chunk sideOf() recorded (same id). */
function ctxChunk(doc: string, index: number, content?: string, id: string | null = `${doc}-c${index}`): ContextChunk {
  return { document_id: doc, chunk_index: index, id, content };
}

function passage(doc: string, indexes: number[], similarity = 0.8): CitablePassage {
  return {
    document_id: doc,
    title: doc,
    content: `${doc} text`,
    similarity,
    chunk_index: indexes[0],
    chunk_indexes: indexes,
    metadata: {},
  };
}

test("drops the losing chunk when it is in the turn's context", () => {
  const plan = planConflictResolutions([resolved()], [ctxChunk("old", 2), ctxChunk("old", 3), ctxChunk("new", 5)]);
  assert.deepEqual([...plan.drop], [chunkKey("old", 2)]);
  assert.equal(plan.relevant.length, 1);

  const kept = withoutDropped(
    [{ document_id: "old", chunk_index: 2 }, { document_id: "old", chunk_index: 3 }, { document_id: "new", chunk_index: 5 }],
    plan.drop
  );
  assert.deepEqual(kept.map((k) => chunkKey(k.document_id, k.chunk_index)), ["old:3", "new:5"]);
});

test("ignores open, dismissed and auto-dismissed conflicts, and ones not in reach", () => {
  const context = [ctxChunk("old", 2), ctxChunk("new", 5)];
  for (const status of ["open", "dismissed", "auto_dismissed"]) {
    const plan = planConflictResolutions([resolved({ status, resolution: null })], context);
    assert.equal(plan.drop.size, 0);
    assert.equal(plan.relevant.length, 0);
    assert.deepEqual(clarificationPassages(plan.relevant, [passage("old", [2])]), []);
  }
  const elsewhere = planConflictResolutions([resolved()], [ctxChunk("other", 1)]);
  assert.equal(elsewhere.relevant.length, 0);
});

test("adds the winning statement, cited to the winning document, when its chunk wasn't retrieved", () => {
  const plan = planConflictResolutions([resolved()], [ctxChunk("old", 2)]);
  const passages = [passage("other", [1])];
  const added = clarificationPassages(plan.relevant, passages, new Map([[chunkKey("old", 2), 0.77]]));
  assert.equal(added.length, 1);
  assert.equal(added[0].document_id, "new");
  assert.equal(added[0].chunk_index, 5);
  assert.equal(added[0].clarification, "winner");
  assert.equal(added[0].metadata.page, 6);
  assert.equal(added[0].similarity, 0.77);
  assert.equal(added[0].content, "School clarification: Pickup is at 3:15 PM (from Fall Letter)");
});

test("adds nothing for the winner when a passage of its document says it", () => {
  const plan = planConflictResolutions([resolved()], [ctxChunk("old", 2), ctxChunk("new", 5)]);
  const winning = { ...passage("new", [4, 5, 6]), content: "Dismissal: pickup is at 3:15 pm,  by the gym." };
  assert.deepEqual(clarificationPassages(plan.relevant, [winning]), []);
  // The same document without the statement still gets it.
  assert.equal(clarificationPassages(plan.relevant, [passage("new", [4, 5, 6])]).length, 1);
});

test("a written answer drops both chunks and adds the admin's note as a clarification", () => {
  const c = resolved({ resolution: "custom", admin_note: "  Pickup is at 3:10 PM this year.  " });
  const plan = planConflictResolutions([c], [ctxChunk("old", 2), ctxChunk("new", 5)]);
  assert.deepEqual([...plan.drop].sort(), ["new:5", "old:2"]);
  const [note, ...rest] = clarificationPassages(plan.relevant, []);
  assert.equal(rest.length, 0);
  assert.equal(note.clarification, "note");
  assert.equal(note.title, CLARIFICATION_TITLE);
  assert.equal(note.content, "Pickup is at 3:10 PM this year.");
  assert.equal(note.resolved_at, "2026-10-01");
  assert.ok(isClarificationId(note.document_id));
});

test("a written answer without text is ignored", () => {
  const plan = planConflictResolutions([resolved({ resolution: "custom", admin_note: "  " })], [ctxChunk("old", 2)]);
  assert.equal(plan.drop.size, 0);
  assert.equal(plan.relevant.length, 0);
});

test("a chosen document with a note adds the note as well", () => {
  const plan = planConflictResolutions(
    [resolved({ resolution: "a_correct", admin_note: "The fall letter had a typo." })],
    [ctxChunk("old", 2), ctxChunk("new", 5)]
  );
  assert.deepEqual([...plan.drop], ["new:5"]);
  const added = clarificationPassages(plan.relevant, [{ ...passage("old", [2]), content: "Pickup is at 3:00 PM." }]);
  assert.deepEqual(added.map((p) => p.clarification), ["note"]);
});

test("a chunk that won one ruling isn't dropped for losing another", () => {
  const plan = planConflictResolutions(
    [
      resolved({ id: "c1", resolution: "b_correct" }),
      resolved({ id: "c2", resolution: "a_correct", a: sideOf("new", 5, "x"), b: sideOf("third", 1, "y") }),
      resolved({ id: "c3", resolution: "a_correct", a: sideOf("third", 1, "y"), b: sideOf("new", 5, "x") }),
    ],
    [ctxChunk("old", 2), ctxChunk("new", 5), ctxChunk("third", 1)]
  );
  assert.ok(plan.drop.has("old:2"));
  assert.ok(!plan.drop.has("new:5"));
});

test("dedupes clarifications and caps how many join one turn", () => {
  const sameNote = (id: string) => resolved({ id, resolution: "custom", admin_note: "Pickup is 3:10." });
  const many = Array.from({ length: 6 }, (_, i) =>
    resolved({
      id: `n${i}`,
      resolution: "custom",
      admin_note: `Note ${i}`,
      a: sideOf(`doc${i}`, 0, "a"),
      b: sideOf(`other${i}`, 0, "b"),
    })
  );
  const context = [ctxChunk("old", 2), ...many.map((c) => ctxChunk(c.a.document_id, 0))];
  const plan = planConflictResolutions([sameNote("x1"), sameNote("x2"), ...many], context);
  const added = clarificationPassages(plan.relevant, []);
  assert.equal(added.length, MAX_CLARIFICATIONS);
  assert.equal(added.filter((p) => p.content === "Pickup is 3:10.").length, 1);
});

test("a re-chunked losing document is still matched by its statement", () => {
  // The document was re-processed: the judged chunk is gone (id NULL on the
  // row, or simply not this chunk's id) and the index points elsewhere.
  const gone = resolved({ a: { ...sideOf("old", 2, "Pickup is at 3:00 PM"), chunk_id: null } });
  const rechunked = ctxChunk("old", 7, "Afternoon dismissal.\nPickup is at  3:00 pm in the circle.", "new-chunk-id");
  const plan = planConflictResolutions([gone, resolved()], [rechunked, ctxChunk("old", 2, "Lunch is at noon.", "x")]);
  assert.deepEqual([...plan.drop], ["old:7"]);
  assert.deepEqual(plan.relevant[0].contextKeys, ["old:7"]);

  // The new text no longer says it: kept, and the ruling doesn't apply.
  const reworded = ctxChunk("old", 7, "Pickup moved to the gym entrance.", "new-chunk-id");
  const none = planConflictResolutions([gone], [reworded]);
  assert.equal(none.drop.size, 0);
  assert.equal(none.relevant.length, 0);
});

test("a statement only counts in its own side's document", () => {
  const plan = planConflictResolutions([resolved()], [ctxChunk("third", 1, "Pickup is at 3:00 PM", "t1")]);
  assert.equal(plan.relevant.length, 0);
});

test("a written answer drops both sides by statement after re-chunking", () => {
  const c = resolved({
    resolution: "custom",
    admin_note: "Pickup is at 3:10 PM.",
    a: { ...sideOf("old", 2, "Pickup is at 3:00 PM"), chunk_id: null },
    b: { ...sideOf("new", 5, "Pickup is at 3:15 PM"), chunk_id: null },
  });
  const plan = planConflictResolutions(
    [c],
    [
      ctxChunk("old", 9, "pickup is at 3:00 PM daily", "o9"),
      ctxChunk("new", 1, "Note: Pickup is at 3:15 PM.", "n1"),
      ctxChunk("new", 2, "Bring a water bottle.", "n2"),
    ]
  );
  assert.deepEqual([...plan.drop].sort(), ["new:1", "old:9"]);
});

test("context chunks carry the vector hits' ids", () => {
  const context = conflictContext(
    new Map([
      ["doc-1:3", { content: "three" }],
      ["doc-2:0", { content: "zero" }],
    ]),
    [{ id: "chunk-13", document_id: "doc-1", chunk_index: 3 }]
  );
  assert.deepEqual(context, [
    { document_id: "doc-1", chunk_index: 3, id: "chunk-13", content: "three" },
    { document_id: "doc-2", chunk_index: 0, id: undefined, content: "zero" },
  ]);
});

// ── Clarifications in the prompt and the citation list ───────────────────────

test("labels an admin note in the prompt and tells the model to follow it", () => {
  const note: CitablePassage = {
    ...passage("clarification:c1", []),
    title: CLARIFICATION_TITLE,
    content: "Pickup is at 3:10 PM.",
    clarification: "note",
    resolved_at: "2026-10-01",
  };
  const prompt = buildSystemPrompt([passage("handbook", [1]), note]);
  assert.match(prompt, /Admin clarification \(written by the school's administrators to settle conflicting documents, 2026-10-01\)\n\n\[Source 2\]\nPickup is at 3:10 PM\./);
  assert.match(prompt, /follow it over any document that says otherwise/);
});

test("without clarifications the prompt is unchanged", () => {
  const prompt = buildSystemPrompt([passage("handbook", [1])]);
  assert.doesNotMatch(prompt, /clarification/i);
});

function source(n: number, over: Partial<ChatSource> = {}): ChatSource {
  return {
    document_id: `doc-${n}`,
    title: `Document ${n}`,
    chunk_content: "text",
    similarity: 0.8,
    source_number: n,
    source_type: "document",
    ...over,
  };
}

const clarificationSource = (n: number, conflictId: string): ChatSource =>
  source(n, {
    document_id: `clarification:${conflictId}`,
    title: CLARIFICATION_TITLE,
    source_type: "clarification",
    location: null,
  });

test("admin clarifications render as one deduped 'School clarification' row, without a link", () => {
  const sources = [source(1), clarificationSource(2, "c1"), clarificationSource(3, "c2")];
  const groups = groupSources(sources, new Set([2, 1, 3]));
  assert.deepEqual(groups.map((g) => g.title), [CLARIFICATION_TITLE, "Document 1"]);
  assert.deepEqual(groups[0].passages.map((p) => p.source_number), [2, 3]);
  assert.equal(groups[0].isWebsite, false);
});

test("a clarification counts toward the three-row citation cap", () => {
  const sources = [clarificationSource(1, "c1"), source(2), source(3), source(4)];
  const groups = groupSources(sources, new Set([1, 2, 3, 4]));
  assert.equal(groups.length, MAX_SOURCE_ROWS);
  assert.deepEqual(groups.map((g) => g.title), [CLARIFICATION_TITLE, "Document 2", "Document 3"]);
});

test("an uncited answer never falls back to a clarification row", () => {
  const groups = groupSources([clarificationSource(1, "c1"), source(2, { similarity: 0.6 })], new Set());
  assert.deepEqual(groups.map((g) => g.title), ["Document 2"]);
});

// ── Scan runs ────────────────────────────────────────────────────────────────

test("a running scan counts as active only until it goes stale", () => {
  const run = { status: "running", started_at: new Date(1_000_000).toISOString() } as ScanRunSummary;
  assert.equal(isRunActive(run, 1_000_000 + 60_000), true);
  assert.equal(isRunActive(run, 1_000_000 + STALE_RUN_MS + 1), false);
  assert.equal(isRunActive({ ...run, status: "completed" }, 1_000_001), false);
  assert.equal(isRunActive(null), false);
});

// ── Already-reviewed conflicts under new chunk ids ───────────────────────────

const reviewedRow: ReviewedConflict = {
  document_a_id: "handbook",
  document_b_id: "letter",
  statement_a: "Pickup is at 3:00 PM",
  statement_b: "Pickup is at 3:15 PM",
};

test("a re-chunked pair with both reviewed statements is recognised, either way round", () => {
  const index = indexReviewedConflicts([reviewedRow]);
  const handbookText = "Dismissal\nPickup is at 3:00 pm at the front circle.";
  const letterText = "Reminder: pickup is at 3:15 PM starting Monday.";
  assert.equal(isReviewedConflict(pair("h9", "l4", "handbook", "letter", 0.9), handbookText, letterText, index), true);
  assert.equal(isReviewedConflict(pair("l4", "h9", "letter", "handbook", 0.9), letterText, handbookText, index), true);
  // Statements swapped between the documents don't count.
  assert.equal(isReviewedConflict(pair("h9", "l4", "handbook", "letter", 0.9), letterText, handbookText, index), false);
  // Only one statement still there: a new question.
  assert.equal(
    isReviewedConflict(pair("h9", "l4", "handbook", "letter", 0.9), handbookText, "Pickup moved to 3:30.", index),
    false
  );
  // Another document pair.
  assert.equal(isReviewedConflict(pair("h9", "x1", "handbook", "other", 0.9), handbookText, letterText, index), false);
});

test("rows without both statements never dedupe", () => {
  const index = indexReviewedConflicts([{ ...reviewedRow, statement_b: null }, { ...reviewedRow, statement_a: " " }]);
  assert.equal(index.size, 0);
});

test("filterCandidates skips a pair already reviewed under other chunk ids", () => {
  const ctx = setup(
    { handbook: upload, letter: upload },
    { h9: "Pickup is at 3:00 PM daily.", l4: "Pickup is at 3:15 PM now.", h1: "Lunch is at noon.", l2: "Lunch is at 12:30." }
  );
  const { selected, skipped } = filterCandidates(
    [pair("h9", "l4", "handbook", "letter", 0.9), pair("h1", "l2", "handbook", "letter", 0.88)],
    { ...ctx, reviewed: indexReviewedConflicts([reviewedRow]) },
    { limit: 10 }
  );
  assert.deepEqual(selected.map((c) => c.chunk_a_id), ["h1"]);
  assert.equal(skipped.already_reviewed, 1);
});

// ── In-memory candidates (dry run before 046) ────────────────────────────────

function embedded(id: string, doc: string, v: number[]): EmbeddedChunk {
  const vector = new Float32Array(v);
  normalizeVector(vector);
  return { id, document_id: doc, vector };
}

test("parses pgvector text and arrays, rejecting junk", () => {
  assert.deepEqual([...parseEmbedding("[1,2.5,-3]")!], [1, 2.5, -3]);
  assert.deepEqual([...parseEmbedding([0.5, 0.25])!], [0.5, 0.25]);
  assert.equal(parseEmbedding("[1,"), null);
  assert.equal(parseEmbedding('["a"]'), null);
  assert.equal(parseEmbedding(null), null);
  const zero = new Float32Array([0, 0]);
  assert.equal(normalizeVector(zero), false);
});

test("finds nearest neighbours in other documents only, above the threshold, top k", () => {
  const chunks = [
    embedded("a1", "A", [1, 0, 0]),
    embedded("a2", "A", [0.99, 0.1, 0]), // same document as a1: never paired with it
    embedded("b1", "B", [0.95, 0.2, 0]),
    embedded("b2", "B", [0.9, 0.3, 0.1]),
    embedded("c1", "C", [0, 0, 1]), // far from everything
  ];
  const pairs = nearestCrossDocumentPairs(chunks, { k: 8, threshold: 0.9 });
  const keys = pairs.map((p) => pairKey(p.chunk_a_id, p.chunk_b_id));
  assert.deepEqual(new Set(keys), new Set(["a1:b1", "a1:b2", "a2:b1", "a2:b2"]));
  assert.ok(pairs.every((p) => p.document_a_id !== p.document_b_id && p.similarity >= 0.9));
  assert.ok(pairs.every((p, i) => i === 0 || pairs[i - 1].similarity >= p.similarity));
  const a1b1 = pairs.find((p) => pairKey(p.chunk_a_id, p.chunk_b_id) === "a1:b1")!;
  assert.ok(Math.abs(a1b1.similarity - 0.95 / Math.hypot(0.95, 0.2)) < 1e-5);

  // k = 1: each chunk keeps only its best other-document neighbour.
  const top1 = nearestCrossDocumentPairs(chunks, { k: 1, threshold: 0.5 });
  assert.deepEqual(
    new Set(top1.map((p) => pairKey(p.chunk_a_id, p.chunk_b_id))),
    new Set(["a1:b1", "a2:b1", "a2:b2"])
  );

  // Only document B's chunks look: a pair needs a B side.
  const fromB = nearestCrossDocumentPairs([...chunks, embedded("c2", "C", [1, 0, 0])], {
    k: 8,
    threshold: 0.9,
    sourceDocumentIds: new Set(["B"]),
  });
  assert.ok(fromB.every((p) => p.document_a_id === "B" || p.document_b_id === "B"));
  assert.ok(fromB.some((p) => pairKey(p.chunk_a_id, p.chunk_b_id) === "b1:c2"));
});

test("stores the whole short chunk, or a window around the statement", () => {
  assert.equal(storedExcerpt("Pickup is at 3:00 PM.", "3:00 PM"), "Pickup is at 3:00 PM.");
  const long = `${"intro ".repeat(300)}Pickup is at 3:00 PM. ${"outro ".repeat(300)}`;
  const e = storedExcerpt(long, "Pickup is at 3:00 PM", 100);
  assert.ok(e.startsWith("… ") && e.endsWith(" …"));
  assert.ok(e.includes("Pickup is at 3:00 PM"));
  assert.ok(e.length < 260);
});
