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
import {
  citedEventSources,
  citedNumbersInOrder,
  eventSource,
  eventSourceHref,
  formatEventWhen,
  renumberCitations,
} from "./citations";
import { formatEventsContext, type CalendarEntry } from "./context";
import { buildSystemPrompt } from "./system-prompt";

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

test("lists only the documents the answer cites", () => {
  const sources = [source(1, "Letter", 1, 0.6), source(2, "Letter", 2, 0.9), source(3, "Handbook", 7)];

  const groups = groupSources(sources, new Set([3]));

  assert.deepEqual(groups.map((g) => g.key), ["Handbook"]);
  assert.equal(groups[0].isCited, true);
});

// ── Per-answer renumbering ───────────────────────────────────────────────────

test("renumbers citations 1, 2, 3… in order of first appearance", () => {
  const sources = [7, 4, 8, 17].map((n) => source(n, `doc${n}`, n));

  const out = renumberCitations("Lunch is at noon [4]. Pickup is at 3 [7][8]. Again [4]. Gym [17].", sources);

  assert.equal(out.content, "Lunch is at noon [1]. Pickup is at 3 [2][3]. Again [1]. Gym [4].");
  assert.deepEqual(
    out.sources.map((s) => [s.source_number, s.document_id]),
    [[1, "doc4"], [2, "doc7"], [3, "doc8"], [4, "doc17"]]
  );
});

test("every renumbered marker still opens the passage the model cited", () => {
  const sources = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => source(n, `doc${n}`, n));
  const raw = "A [7]. B [3]. C [7].";

  const out = renumberCitations(raw, sources);

  const opened = [...out.content.matchAll(/\[(\d+)\]/g)].map(
    (m) => out.sources.find((s) => s.source_number === Number(m[1]))!.document_id
  );
  assert.deepEqual(opened, ["doc7", "doc3", "doc7"]);
});

test("keeps uncited sources, numbered after the cited ones in their old order", () => {
  const sources = [1, 2, 3].map((n) => source(n, `doc${n}`, n));

  const out = renumberCitations("Only this [3].", sources);

  assert.deepEqual(
    out.sources.map((s) => [s.source_number, s.document_id]),
    [[1, "doc3"], [2, "doc1"], [3, "doc2"]]
  );
});

test("drops markers that resolve to no source", () => {
  const out = renumberCitations("Real [5]. Bogus [99].", [source(5, "doc5", 1)]);
  assert.equal(out.content, "Real [1]. Bogus.");
  assert.equal(renumberCitations("No sources [1].", []).content, "No sources.");
});

test("renumbering is idempotent, so saved answers render unchanged", () => {
  const sources = [3, 9, 12].map((n) => source(n, `doc${n}`, n));
  const once = renumberCitations("X [12]. Y [3].", sources);
  const twice = renumberCitations(once.content, once.sources);
  assert.deepEqual(twice, once);
});

test("passage badges of one document show the new numbers, in order", () => {
  const sources = [source(7, "MSHandbook 25.26", 14), source(8, "MSHandbook 25.26", 15), source(2, "Letter", 1)];

  const out = renumberCitations("Dress code [8]. Phones [7]. Trip [2].", sources);
  const groups = groupSources(out.sources, new Set(citedNumbersInOrder(out.content)));

  assert.deepEqual(groups.map((g) => g.title), ["MSHandbook 25.26", "Letter"]);
  assert.deepEqual(
    groups[0].passages.map((p) => [p.source_number, p.location?.label]),
    [[1, "p. 15"], [2, "p. 14"]]
  );
  assert.deepEqual(groups[1].passages.map((p) => p.source_number), [3]);
});

// ── Calendar entries as citable sources ──────────────────────────────────────

function entry(id: string, extra: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id,
    title: `Event ${id}`,
    description: null,
    date: "2026-10-30",
    date_end: null,
    start_time: null,
    end_time: null,
    location: null,
    event_type: "event",
    ...extra,
  };
}

test("formats an event's date, with the time unless it's all-day", () => {
  assert.equal(formatEventWhen({ date: "2026-10-30" }), "Fri, Oct 30, 2026");
  assert.equal(
    formatEventWhen({ date: "2026-10-30", start_time: "15:00:00", end_time: "16:30:00" }),
    "Fri, Oct 30, 2026 · 3:00 PM – 4:30 PM"
  );
  assert.equal(formatEventWhen({ date: "2026-10-30", start_time: "00:15" }), "Fri, Oct 30, 2026 · 12:15 AM");
  assert.equal(
    formatEventWhen({ date: "2025-12-22", date_end: "2026-01-02" }),
    "Dec 22, 2025 – Jan 2, 2026"
  );
});

test("an event source carries its number, date label and calendar link", () => {
  const s = eventSource(entry("ev1", { title: "Fall Fair", start_time: "09:00:00" }), 6, "line");

  assert.equal(s.source_type, "event");
  assert.equal(s.source_number, 6);
  assert.equal(s.title, "Fall Fair");
  assert.equal(s.location?.label, "Fri, Oct 30, 2026 · 9:00 AM");
  assert.equal(eventSourceHref("collegiate", s), "/s/collegiate/parent/events?date=2026-10-30");
  assert.equal(eventSourceHref("collegiate", source(1, "doc", 1)), null);
});

test("calendar entries are numbered after the documents in the prompt", () => {
  const block = formatEventsContext([entry("a"), entry("b", { title: "Recess" })], 4);
  assert.match(block, /\[Source 4\] "Event a" on 2026-10-30/);
  assert.match(block, /\[Source 5\] "Recess" on 2026-10-30/);
});

test("only cited events are kept, in order of first citation", () => {
  const events = [entry("a"), entry("b"), entry("c")].map((e, i) => eventSource(e, 10 + i, ""));

  const cited = citedEventSources("Fair [12]. Doc [1]. Recess [10]. Fair again [12].", events);

  assert.deepEqual(cited.map((s) => s.document_id), ["c", "a"]);
});

test("events and documents share one sequence in order of first appearance", () => {
  const docs = [source(1, "Handbook", 3), source(2, "Letter", 1)];
  const events = [entry("fair", { title: "Fall Fair" }), entry("recess")].map((e, i) =>
    eventSource(e, 3 + i, "")
  );
  const raw = "The fair is Friday [3]. Bring a lunch [2]. Fair rules [1]. Fair again [3].";

  const out = renumberCitations(raw, [...docs, ...citedEventSources(raw, events)]);

  assert.equal(out.content, "The fair is Friday [1]. Bring a lunch [2]. Fair rules [3]. Fair again [1].");
  const groups = groupSources(out.sources, new Set(citedNumbersInOrder(out.content)));
  assert.deepEqual(
    groups.map((g) => [g.title, g.isEvent, g.passages.map((p) => p.source_number)]),
    [["Fall Fair", true, [1]], ["Letter", false, [2]], ["Handbook", false, [3]]]
  );
  // The uncited recess entry never reaches the parent.
  assert.ok(!out.sources.some((s) => s.document_id === "recess"));
});

test("events with the same title on different days stay separate rows", () => {
  const events = [
    eventSource(entry("d1", { title: "Early Dismissal", date: "2026-11-03" }), 1, ""),
    eventSource(entry("d2", { title: "Early Dismissal", date: "2026-11-10" }), 2, ""),
  ];

  const groups = groupSources(events, new Set([1, 2]));

  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.isEvent));
});

test("the prompt makes the calendar citable", () => {
  const prompt = buildSystemPrompt([], { eventsContext: formatEventsContext([entry("a")], 1) });
  assert.match(prompt, /CITATIONS/);
  assert.match(prompt, /<calendar>/);
  assert.doesNotMatch(prompt, /Never cite the calendar/);
});
