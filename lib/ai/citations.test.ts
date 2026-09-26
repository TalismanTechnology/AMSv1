import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assemblePassages,
  mergePassageMetadata,
  splitIntoPassages,
  type ChunkMetadata,
  type KeywordHit,
  type RelevantChunk,
} from "./rag";
import { stitchChunks } from "./stitch";
import { stripCitationMarkers, sanitizeMessages } from "./chat-turn";
import { extractSpecifics, findCitationMismatches } from "./citation-check";
import { splitVisionPages } from "@/lib/documents/parser";
import { groupSources } from "@/lib/source-groups";
import type { ChatSource } from "@/lib/types";

// ── Passage splitting ────────────────────────────────────────────────────────

test("splits chunk indexes into contiguous runs", () => {
  assert.deepEqual(splitIntoPassages([9, 3, 4, 10, 5]), [[3, 4, 5], [9, 10]]);
});

test("cuts a long run into balanced passages of at most three chunks", () => {
  assert.deepEqual(splitIntoPassages([1, 2, 3, 4]), [[1, 2], [3, 4]]);
  assert.deepEqual(splitIntoPassages([1, 2, 3, 4, 5, 6, 7]), [[1, 2, 3], [4, 5, 6], [7]]);
});

test("reports the full page range a passage spans", () => {
  const merged = mergePassageMetadata([{ page: 14 }, { page: 15 }, undefined]);

  assert.deepEqual(merged, { page: 14, page_end: 15 });
});

test("keeps a single-page passage free of a page range", () => {
  assert.deepEqual(mergePassageMetadata([{ page: 3 }, { page: 3 }]), { page: 3 });
});

// ── Passage assembly ─────────────────────────────────────────────────────────

function hit(chunk_index: number, similarity: number, document_id = "handbook"): RelevantChunk {
  return {
    id: `${document_id}-${chunk_index}`,
    document_id,
    content: `chunk ${chunk_index}`,
    chunk_index,
    metadata: { page: chunk_index },
    similarity,
    document_title: document_id === "handbook" ? "Handbook" : "Letter",
  };
}

function knownFor(docs: Record<string, number[]>): Map<string, { content: string; metadata: ChunkMetadata }> {
  const known = new Map<string, { content: string; metadata: ChunkMetadata }>();
  for (const [doc, indexes] of Object.entries(docs)) {
    for (const i of indexes) {
      known.set(`${doc}:${i}`, { content: `${doc} text ${i}.`, metadata: { page: i } });
    }
  }
  return known;
}

test("gives two far-apart matches in one document separate source numbers and pages", () => {
  const chunks = [hit(10, 0.8), hit(40, 0.7)];
  const known = knownFor({ handbook: [9, 10, 11, 39, 40, 41] });

  const passages = assemblePassages(chunks, [], known);

  assert.equal(passages.length, 2);
  assert.deepEqual(passages.map((p) => p.metadata.page), [9, 39]);
  assert.deepEqual(passages.map((p) => p.chunk_indexes), [[9, 10, 11], [39, 40, 41]]);
  assert.match(passages[1].content, /handbook text 40\./);
  assert.doesNotMatch(passages[1].content, /handbook text 10\./);
});

test("scores each passage by its own best match, not the document's", () => {
  const passages = assemblePassages([hit(10, 0.8), hit(40, 0.6)], [], knownFor({ handbook: [9, 10, 11, 39, 40, 41] }));

  assert.deepEqual(passages.map((p) => p.similarity), [0.8, 0.6]);
});

test("orders the strongest document's passages first, each in reading order", () => {
  const chunks = [hit(20, 0.9, "letter"), hit(40, 0.7), hit(5, 0.65)];
  const known = knownFor({ letter: [19, 20, 21], handbook: [4, 5, 6, 39, 40, 41] });

  const passages = assemblePassages(chunks, [], known);

  assert.deepEqual(
    passages.map((p) => `${p.document_id}:${p.chunk_index}`),
    ["letter:19", "handbook:4", "handbook:39"]
  );
});

test("gives a keyword-only match its own passage within a cited document", () => {
  const keyword: KeywordHit = { document_id: "handbook", chunk_index: 60, content: "nurse ext 204", rank: 1 };
  const known = knownFor({ handbook: [1, 2, 3, 59, 60, 61] });

  const passages = assemblePassages([hit(2, 0.7)], [keyword], known);

  assert.deepEqual(passages.map((p) => p.chunk_indexes), [[1, 2, 3], [59, 60, 61]]);
});

test("cites nothing when no chunk clears the similarity floor", () => {
  assert.deepEqual(assemblePassages([hit(1, 0.3)], [], knownFor({ handbook: [0, 1, 2] })), []);
});

// ── Stitching ────────────────────────────────────────────────────────────────

test("removes the overlap between adjacent chunks", () => {
  const overlap = "shared sentence that repeats at the seam.";
  const text = stitchChunks([
    { chunk_index: 0, content: `Opening text. ${overlap}` },
    { chunk_index: 1, content: `${overlap} Closing text.` },
  ]);

  assert.equal(text, `Opening text. ${overlap} Closing text.`);
});

test("separates adjacent chunks that share no overlap instead of running them together", () => {
  const text = stitchChunks([
    { chunk_index: 0, content: "End of page one." },
    { chunk_index: 1, content: "Start of page two." },
  ]);

  assert.equal(text, "End of page one.\n\nStart of page two.");
});

// ── History sanitising ───────────────────────────────────────────────────────

test("strips stale citation numbers from a past answer", () => {
  assert.equal(
    stripCitationMarkers("Pickup is at 3:15 PM [2]. Call the office [1][3]. Older [Source 4] form."),
    "Pickup is at 3:15 PM. Call the office. Older form."
  );
});

test("strips citations from assistant history but leaves the parent's words alone", () => {
  const messages = sanitizeMessages([
    { id: "u", role: "user", parts: [{ type: "text", text: "What does [1] mean?" }] },
    {
      id: "a",
      role: "assistant",
      parts: [
        { type: "text", text: "Classes start at 8:30 AM [1]." },
        { type: "data-sources", data: [] } as never,
      ],
    },
  ]);

  assert.equal((messages[0].parts[0] as { text: string }).text, "What does [1] mean?");
  assert.deepEqual(messages[1].parts, [{ type: "text", text: "Classes start at 8:30 AM." }]);
});

// ── Citation precision check (eval) ──────────────────────────────────────────

test("extracts times, phone numbers, emails and amounts as specifics", () => {
  const specifics = extractSpecifics("Call (555) 123-4567 or nurse@school.org by 8:30 AM; the fee is $1,200.");

  assert.deepEqual(specifics.sort(), ["$1,200", "(555) 123-4567", "8:30", "nurse@school.org"].sort());
});

test("accepts a citation whose passage contains the clause's specifics", () => {
  const passages = ["Classes begin at 8:30 AM.", "Call the nurse at 555.123.4567."];

  assert.deepEqual(
    findCitationMismatches("Classes begin at 8:30 AM [1]. The nurse is at (555) 123-4567 [2].", passages),
    []
  );
});

test("tolerates the split digits and spaced @ that PDF text layers produce", () => {
  const passages = ["Winter Break Monday, December 2 1 – Friday, January 1. Example: hjones@ collegiateschool.org."];

  assert.deepEqual(
    findCitationMismatches("Winter break starts December 21 [1]. For example, hjones@collegiateschool.org [1].", passages),
    []
  );
});

test("flags a fact cited to another passage of the same document", () => {
  const passages = ["Students wear collared shirts.", "Report absences by 9:00 AM."];

  const mismatches = findCitationMismatches("Report absences by 9:00 AM [1].", passages);

  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].token, "9:00");
  assert.deepEqual(mismatches[0].cited, [1]);
});

// ── Vision page markers ──────────────────────────────────────────────────────

test("turns page markers in a Vision transcription into page-tagged segments", () => {
  const segments = splitVisionPages("Cover note\n=== PAGE 1 ===\nWelcome.\n=== PAGE 2 ===\nDress code.\n");

  assert.deepEqual(segments, [
    { text: "Cover note", metadata: {} },
    { text: "Welcome.", metadata: { page: 1 } },
    { text: "Dress code.", metadata: { page: 2 } },
  ]);
});

test("keeps an unmarked Vision transcription as one untagged segment", () => {
  assert.deepEqual(splitVisionPages("Just text."), [{ text: "Just text.", metadata: {} }]);
});

// ── Source list grouping ─────────────────────────────────────────────────────

function source(n: number, document_id: string, page: number, similarity = 0.7): ChatSource {
  return {
    document_id,
    title: document_id,
    chunk_content: `passage ${n}`,
    similarity,
    source_number: n,
    source_type: "document",
    location: { label: `p. ${page}`, page },
  };
}

test("lists a document once with a chip for each passage the answer cites", () => {
  const sources = [source(1, "Handbook", 12), source(2, "Handbook", 30), source(3, "Handbook", 44)];

  const groups = groupSources(sources, new Set([1, 3]));

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].passages.map((p) => p.source_number), [1, 3]);
  assert.equal(groups[0].isCited, true);
});

test("lists cited documents before uncited ones, uncited at their strongest passage", () => {
  const sources = [source(1, "Letter", 1, 0.6), source(2, "Letter", 2, 0.9), source(3, "Handbook", 7)];

  const groups = groupSources(sources, new Set([3]));

  assert.deepEqual(groups.map((g) => g.key), ["Handbook", "Letter"]);
  assert.equal(groups[1].isCited, false);
  assert.equal(groups[1].passages[0].source_number, 2);
});
