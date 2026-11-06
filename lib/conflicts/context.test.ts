import { test } from "node:test";
import assert from "node:assert/strict";
import { splitTextIntoChunks } from "@/lib/ai/chunking";
import {
  locateQuoteInWindow,
  MIN_SEAM_OVERLAP,
  pinQuoteToWindow,
  quoteAppearsIn,
  seamOverlapEnd,
  stitchChunkWindow,
} from "./quotes";
import {
  filterCandidates,
  isArchivalPeriodical,
  isPlaceholderChunk,
  MIN_CHUNK_TEXT_CHARS,
  type CandidateDocument,
  type CandidatePair,
} from "./candidates";
import {
  describeYearClues,
  differentYearEvidence,
  documentSeriesTitle,
  findWeekdayDates,
  isStandingPolicyTitle,
  sameDocumentSeries,
  yearRange,
} from "./years";
import { buildJudgePrompt, describeSide, MIN_CONFLICT_CONFIDENCE, verdictFor, type JudgePair, type Judgment } from "./judge";
import { applyVerification, buildVerifyPrompt, MIN_VERIFIER_CONFIDENCE } from "./verify";
import { DEFAULT_MAX_JUDGED, DEFAULT_SIMILARITY_THRESHOLD } from "./scan";
import { formatShortDate, isClearlyNewer, NEWER_MARGIN_MS, originLabel, originTime } from "./display";

// Today is November 2026: the production case that prompted these tests.
const range = yearRange(new Date("2026-11-05T12:00:00Z"));

// The production pair: the clothing list (chunk 1) matched the handbook, but
// the new dates were in the chunk above it.
const EMAIL_CHUNK_0 =
  "Winter Dress Code Begins Monday, November 23. Dear Middle School families, as the weather turns colder, " +
  "winter dress code will be in effect starting Monday, November 23 through Thursday, February 25. Please " +
  "review the expectations below with your son.";
const EMAIL_CHUNK_1 =
  "Please review the expectations below with your son. Boys should wear collared shirts, ties, blazers or " +
  "sweaters, and dress slacks. No sneakers. Ties are expected to be worn every day.";
const HANDBOOK_CHUNK =
  "Dress Code. Collared shirts and dress slacks are expected at all times. Blazers or sweaters and ties - are " +
  "expected to be worn during the winter term Nov 1 through the end of spring break.";

// ── Settings ─────────────────────────────────────────────────────────────────

test("scan settings: wider candidate net, larger budget", () => {
  assert.equal(DEFAULT_SIMILARITY_THRESHOLD, 0.78);
  assert.equal(DEFAULT_MAX_JUDGED, 80);
  assert.equal(MIN_CONFLICT_CONFIDENCE, 0.8);
  assert.equal(MIN_VERIFIER_CONFIDENCE, 0.75);
  assert.equal(MIN_CHUNK_TEXT_CHARS, 40);
});

test("excerpts up to 3600 characters reach the judge whole", () => {
  const side = (text: string) => ({ documentTitle: "Doc", documentDates: "", divisions: [], location: null, text });
  const fits = "x".repeat(3600);
  assert.ok(describeSide("A", side(fits)).includes(`${fits}\n</excerpt_a>`));
  const long = describeSide("A", side("y".repeat(4000)));
  assert.ok(long.includes(`${"y".repeat(3600)}…\n</excerpt_a>`));
  assert.ok(!long.includes("y".repeat(3601)));
});

// ── Stitching neighbouring chunks ────────────────────────────────────────────

test("stitches a window without repeating the chunker's overlap", () => {
  const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} talks about school policy item ${i}.`).join(" ");
  const chunks = splitTextIntoChunks(text);
  assert.ok(chunks.length >= 3);
  const [c0, c1, c2] = chunks.map((c) => c.content);
  const stitched = stitchChunkWindow(c0, c1, c2);
  // Exactly the original text from c0's start to c2's end, each sentence once.
  const end = text.indexOf(c2) + c2.length;
  assert.equal(stitched, text.slice(0, end));
  assert.equal(stitched.split("Sentence number 5 ").length, 2);
});

test("trims an overlap despite case and spacing differences, keeping the current chunk's words", () => {
  const prev = "Intro text here. The winter term runs from November   through spring break";
  const current = "the Winter term runs from November through Spring Break, and ties are required.";
  assert.equal(
    stitchChunkWindow(prev, current, null),
    "Intro text here. The winter term runs from November   through spring break, and ties are required."
  );
});

test("joins chunks that don't overlap (or barely do) with a blank line", () => {
  assert.equal(stitchChunkWindow("Page one ends here.", "Page two starts here.", null), "Page one ends here.\n\nPage two starts here.");
  // Shorter than MIN_SEAM_OVERLAP: a coincidence, not the chunker's overlap.
  const short = "ends with ties.";
  assert.ok(short.length < MIN_SEAM_OVERLAP);
  assert.equal(stitchChunkWindow(`Rule: ${short}`, `${short} Next rule.`, null), `Rule: ${short}\n\n${short} Next rule.`);
});

test("a window with no neighbours is just the chunk", () => {
  assert.equal(stitchChunkWindow(null, "  Only chunk.  ", null), "Only chunk.");
  assert.equal(stitchChunkWindow("", "Only chunk.", "   "), "Only chunk.");
});

test("stitches both sides: previous chunk, current, next", () => {
  const stitched = stitchChunkWindow(EMAIL_CHUNK_0, EMAIL_CHUNK_1, "Thank you for your support this winter.");
  assert.equal(stitched.split("Please review the expectations below with your son.").length, 2);
  assert.ok(stitched.startsWith("Winter Dress Code Begins"));
  assert.ok(stitched.endsWith("\n\nThank you for your support this winter."));
  assert.equal(quoteAppearsIn("starting Monday, November 23 through Thursday, February 25", stitched), true);
});

test("seam overlap end points just past the repeated text", () => {
  const head = "Please review the expectations below with your son. Boys should wear";
  const cut = seamOverlapEnd(EMAIL_CHUNK_0, head);
  assert.equal(head.slice(cut), " Boys should wear");
  assert.equal(seamOverlapEnd("nothing in common at all here, really", head), 0);
  // The whole head repeated.
  assert.equal(seamOverlapEnd(`Lead in. ${head}`, head), head.length);
});

// ── Pinning quotes to a chunk ────────────────────────────────────────────────

test("locates a quote in the matched chunk first, then a neighbour; a seam quote stays with the match", () => {
  assert.equal(locateQuoteInWindow("Ties are expected to be worn every day", EMAIL_CHUNK_0, EMAIL_CHUNK_1, null), "current");
  assert.equal(locateQuoteInWindow("starting Monday, November 23 through Thursday, February 25", EMAIL_CHUNK_0, EMAIL_CHUNK_1, null), "prev");
  assert.equal(locateQuoteInWindow("Thank you for your support", null, EMAIL_CHUNK_1, "Thank you for your support."), "next");
  // In the overlap, so in both: the matched chunk wins.
  assert.equal(locateQuoteInWindow("Please review the expectations below", EMAIL_CHUNK_0, EMAIL_CHUNK_1, null), "current");
  assert.equal(locateQuoteInWindow("ends here. Page two", "Page one ends here.", "Page two starts.", null), "current");
  assert.equal(locateQuoteInWindow("not anywhere", "a", "b", "c"), "current");
});

test("pins the row to the neighbour holding the quote, excerpting that chunk", () => {
  const prev = { id: "e0", content: EMAIL_CHUNK_0 };
  const current = { id: "e1", content: EMAIL_CHUNK_1 };
  const w = { prev, current, next: null, text: stitchChunkWindow(prev.content, current.content, null) };
  const pinned = pinQuoteToWindow(w, "starting Monday, November 23 through Thursday, February 25");
  assert.equal(pinned.chunk.id, "e0");
  assert.equal(pinned.part, "prev");
  assert.equal(pinned.excerpt, EMAIL_CHUNK_0);

  const own = pinQuoteToWindow(w, "No sneakers.");
  assert.equal(own.chunk.id, "e1");
  assert.equal(own.excerpt, EMAIL_CHUNK_1);

  const none = pinQuoteToWindow(w, null);
  assert.deepEqual([none.chunk.id, none.excerpt], ["e1", EMAIL_CHUNK_1]);
});

test("a quote across a seam keeps the matched chunk and stores the stitched text, so it still highlights", () => {
  const prev = { id: "p", content: "Page one: the fee is due on" };
  const current = { id: "c", content: "August 1 for all families." };
  const w = { prev, current, next: null, text: stitchChunkWindow(prev.content, current.content, null) };
  const quote = "the fee is due on August 1";
  const pinned = pinQuoteToWindow(w, quote);
  assert.equal(pinned.chunk.id, "c");
  assert.equal(quoteAppearsIn(quote, current.content), false);
  assert.equal(quoteAppearsIn(quote, pinned.excerpt), true);
});

test("a quote not in the window excerpts the matched chunk", () => {
  const prev = { id: "p", content: "Something else entirely." };
  const current = { id: "c", content: "Pickup is at 3:00 PM." };
  const w = { prev, current, next: null, text: stitchChunkWindow(prev.content, current.content, null) };
  const pinned = pinQuoteToWindow(w, "Pickup is at 3:30 PM");
  assert.deepEqual([pinned.chunk.id, pinned.excerpt], ["c", "Pickup is at 3:00 PM."]);
});

test("the production case: the date range from the chunk above passes the quote check via the window", () => {
  const windowA = stitchChunkWindow(null, HANDBOOK_CHUNK, null);
  const windowB = stitchChunkWindow(EMAIL_CHUNK_0, EMAIL_CHUNK_1, null);
  const judgment: Judgment = {
    is_conflict: true,
    topic: "Winter dress code dates",
    description: "The handbook says Nov 1 through spring break; the email says November 23 through February 25.",
    statement_a: "expected to be worn during the winter term Nov 1 through the end of spring break",
    statement_b: "starting Monday, November 23 through Thursday, February 25",
    confidence: 0.9,
  };
  // The matched chunk alone can't back the email's quote…
  assert.equal(verdictFor(judgment, HANDBOOK_CHUNK, EMAIL_CHUNK_1, range).reason, "quote_not_found");
  // …its window can.
  assert.equal(verdictFor(judgment, windowA, windowB, range).status, "open");
});

// ── Placeholder chunks and archival periodicals ──────────────────────────────

const upload: CandidateDocument = { source: "upload" };
const pair = (a: string, b: string, docA: string, docB: string, similarity: number): CandidatePair => ({
  chunk_a_id: a,
  chunk_b_id: b,
  document_a_id: docA,
  document_b_id: docB,
  similarity,
});
const long = (s: string) => `${s} — this sentence is long enough to state a real fact for parents.`;

test("placeholder chunks: HTML comments always, short fragments below the minimum", () => {
  assert.equal(isPlaceholderChunk("<!--placeholder-->"), true);
  assert.equal(isPlaceholderChunk("  <!-- image: header.png -->\n"), true);
  assert.equal(isPlaceholderChunk("Page 3 of 10"), true);
  assert.equal(isPlaceholderChunk("— — — !!! ..."), true);
  assert.equal(isPlaceholderChunk(long("Pickup is at 3:00 PM")), false);
  // With no minimum, only empty text and comments.
  assert.equal(isPlaceholderChunk("Page 3", 0), false);
  assert.equal(isPlaceholderChunk("<!--x-->", 0), true);
  assert.equal(isPlaceholderChunk("   ", 0), true);
});

test("filterCandidates skips placeholder chunks as missing_text", () => {
  const docs = new Map(Object.entries({ d1: upload, d2: upload, d3: upload, d4: upload }));
  const chunks = new Map(
    Object.entries({
      a: long("Pickup is at 3:00 PM"),
      b: "<!--placeholder-->",
      c: long("Pickup is at 3:15 PM"),
      d: "Pickup 3:15",
      e: long("Pickup is at 3:30 PM"),
    }).map(([id, content]) => [id, { content }])
  );
  const candidates = [pair("a", "b", "d1", "d2", 0.95), pair("a", "d", "d1", "d4", 0.94), pair("a", "c", "d1", "d3", 0.9)];
  const strict = filterCandidates(candidates, { documents: docs, chunks, judged: new Set() }, { limit: 10, minTextChars: MIN_CHUNK_TEXT_CHARS });
  assert.deepEqual(strict.selected.map((c) => c.chunk_b_id), ["c"]);
  assert.equal(strict.skipped.missing_text, 2);
  // Default: only the HTML comment goes.
  const loose = filterCandidates(candidates, { documents: docs, chunks, judged: new Set() }, { limit: 10 });
  assert.deepEqual(loose.selected.map((c) => c.chunk_b_id), ["d", "c"]);
  assert.equal(loose.skipped.missing_text, 1);
});

test("archival periodicals: alumni magazines, annual reports, yearbooks, journal issues", () => {
  for (const title of [
    "Collegiate Alumni Magazine Spring 2019",
    "Annual Giving Report 2023",
    "Annual Report 2024-25",
    "1998 Yearbook",
    "The Journal - Volume 12, Issue 4",
    "magazine_fall_2020.pdf",
    "Student Newspaper - October",
  ]) {
    assert.equal(isArchivalPeriodical(title), true, title);
  }
  for (const title of ["MSHandbook 25.26 (1)", "Winter Dress Code Begins Monday, November 23", "Journal of Events", "Weekly Digest", null, undefined, ""]) {
    assert.equal(isArchivalPeriodical(title), false, String(title));
  }
});

test("filterCandidates skips pairs of two archival periodicals", () => {
  const documents = new Map<string, CandidateDocument>([
    ["mag1", { source: "upload", title: "Alumni Magazine 2019" }],
    ["mag2", { source: "upload", title: "Alumni Magazine 2021" }],
    ["hb", { source: "upload", title: "MSHandbook 25.26 (1)" }],
    ["email", { source: "email", title: "Winter Dress Code" }],
  ]);
  const chunks = new Map(
    Object.entries({ m1: long("Coach Smith led"), m2: long("Coach Jones led"), h: long("Ties Nov 1"), e: long("Ties Nov 23") }).map(
      ([id, content]) => [id, { content }]
    )
  );
  const { selected, skipped } = filterCandidates(
    [pair("m1", "m2", "mag1", "mag2", 0.97), pair("h", "e", "hb", "email", 0.85)],
    { documents, chunks, judged: new Set() },
    { limit: 10 }
  );
  assert.deepEqual(selected.map((c) => c.chunk_a_id), ["h"]);
  assert.equal(skipped.archival_pair, 1);
});

test("pairs with one archival periodical rank after every other pair and are capped at one per document pair", () => {
  const documents = new Map<string, CandidateDocument>([
    ["mag", { source: "upload", title: "Collegiate Alumni Magazine" }],
    ["hb", { source: "upload", title: "MSHandbook 25.26 (1)" }],
    ["email", { source: "email", title: "Winter Dress Code" }],
    ["cal", { source: "upload", title: "2026-27 Calendar" }],
  ]);
  const texts: Record<string, string> = {};
  for (const id of ["m1", "m2", "m3", "h1", "h2", "e1", "c1"]) texts[id] = long(`Passage ${id}`);
  const chunks = new Map(Object.entries(texts).map(([id, content]) => [id, { content }]));
  const candidates = [
    pair("m1", "h1", "mag", "hb", 0.96),
    pair("m2", "h2", "mag", "hb", 0.95),
    pair("m3", "e1", "mag", "email", 0.94),
    pair("h1", "e1", "hb", "email", 0.82),
    pair("h2", "c1", "hb", "cal", 0.8),
  ];
  const { selected, skipped } = filterCandidates(candidates, { documents, chunks, judged: new Set() }, { limit: 10 });
  assert.deepEqual(
    selected.map((c) => `${c.chunk_a_id}:${c.chunk_b_id}`),
    ["h1:e1", "h2:c1", "m1:h1", "m3:e1"]
  );
  assert.equal(skipped.document_pair_cap, 1);

  // With a tight budget the archival pairs are the ones left out.
  const tight = filterCandidates(candidates, { documents, chunks, judged: new Set() }, { limit: 2 });
  assert.deepEqual(tight.selected.map((c) => c.chunk_a_id), ["h1", "h2"]);
  // m2:h2 isn't capped: m1:h1, its document pair's first, wasn't taken either.
  assert.equal(tight.skipped.over_limit, 3);
});

// ── Standing handbooks vs newer notices (years.ts) ───────────────────────────

test("standing policy titles", () => {
  for (const title of [
    "MSHandbook 25.26 (1)",
    "Upper School Handbook",
    "Parent_Handbook_2024.pdf",
    "Attendance Policy",
    "Faculty Directory",
    "Code of Conduct",
    "Tuition and Financial Aid 2025-26",
    "Curriculum Guide",
    "Technology Guidelines",
    "Employee Manual",
    "Dress Code",
  ]) {
    assert.equal(isStandingPolicyTitle(title), true, title);
  }
  for (const title of ["Weekly Digest - October 1", "2024 Soccer Preseason", "Welcome Back to Middle School", "Hassan Jones 8 20 25 orientation email.pdf"]) {
    assert.equal(isStandingPolicyTitle(title), false, title);
  }
});

test("document series: editions of one handbook match, other documents don't", () => {
  assert.equal(documentSeriesTitle("MSHandbook 25.26 (1).pdf"), "mshandbook");
  assert.equal(sameDocumentSeries("MSHandbook 25.26 (1)", "MSHandbook 26.27"), true);
  assert.equal(sameDocumentSeries("Upper School Handbook 2024-25", "Upper School Handbook 2025-26 (final)"), true);
  assert.equal(sameDocumentSeries("MSHandbook 25.26 (1)", "2026-27 Parents Association Handbook"), false);
  assert.equal(sameDocumentSeries("MSHandbook 25.26 (1)", "Winter Dress Code Begins Monday, November 23"), false);
  assert.equal(sameDocumentSeries("2025", "2026"), false);
});

test("a standing handbook against a newer notice is judged, not auto-dismissed as another year", () => {
  // Titles name different school years, but the handbook is still live.
  assert.equal(
    differentYearEvidence(
      { title: "MSHandbook 25.26 (1)", text: HANDBOOK_CHUNK },
      { title: "2026-27 Parents Association Handbook", text: "Ties are expected from November 23." },
      range
    ),
    null
  );
  // The production pair, with the handbook's calendar page (2025 dates) and
  // the email's dates (2026) read elsewhere.
  assert.equal(
    differentYearEvidence(
      {
        title: "MSHandbook 25.26 (1)",
        text: HANDBOOK_CHUNK,
        documentDates: findWeekdayDates("Wednesday, September 3: classes begin", range),
      },
      {
        title: "Winter Dress Code Begins Monday, November 23",
        text: EMAIL_CHUNK_1,
        documentDates: findWeekdayDates("Monday, November 23", range),
      },
      range
    ),
    null
  );
  // Either side may be the handbook.
  assert.equal(
    differentYearEvidence(
      { title: "2024 Fall Letter", text: "Wednesday, September 4: classes begin" },
      { title: "Lower School Handbook", text: "Wednesday, September 9: classes begin" },
      range
    ),
    null
  );
});

test("two editions of the same handbook are still told apart by year", () => {
  assert.match(
    differentYearEvidence(
      { title: "MSHandbook 25.26 (1)", text: HANDBOOK_CHUNK },
      { title: "MSHandbook 26.27", text: "Ties from November 15." },
      range
    ) ?? "",
    /^Titles name different years/
  );
});

test("an undated handbook chunk doesn't take a year from another page of the handbook", () => {
  const calendar = findWeekdayDates("Wednesday, September 3: classes begin", range);
  // Same handbook series: only the chunks' own dates count, and this one has none.
  assert.equal(
    differentYearEvidence(
      { title: "MSHandbook", text: HANDBOOK_CHUNK, documentDates: calendar },
      { title: "MSHandbook (1)", text: "Wednesday, September 9: classes begin" },
      range
    ),
    null
  );
  assert.equal(describeYearClues({ title: "MSHandbook 25.26 (1)", text: HANDBOOK_CHUNK, documentDates: calendar }, range), "Years in title: 2025-26");
  // A letter still falls back to its other pages.
  assert.equal(
    describeYearClues({ title: "Orientation letter", text: "week of August 25", documentDates: calendar }, range),
    "Weekday dates elsewhere in this document match 2025"
  );
});

test("annual letters from different years are still auto-dismissed", () => {
  assert.notEqual(
    differentYearEvidence(
      { title: "Hassan Jones 8 20 25 orientation email.pdf", text: "Wednesday, September 3 : Middle School classes begin" },
      { title: "Welcome Back to Middle School", text: "Wednesday, September 9: Middle School classes begin" },
      range
    ),
    null
  );
  assert.notEqual(
    differentYearEvidence({ title: "2024 Soccer Preseason", text: "x" }, { title: "2026 Soccer Preseason", text: "y" }, range),
    null
  );
});

// ── Prompts ──────────────────────────────────────────────────────────────────

const side = (documentTitle: string, text: string, source: string | null = "upload") => ({
  documentTitle,
  documentDates: "",
  source,
  divisions: [],
  location: null,
  text,
});
const dressCodePair: JudgePair = {
  a: side("MSHandbook 25.26 (1)", HANDBOOK_CHUNK),
  b: side("Winter Dress Code Begins Monday, November 23", stitchChunkWindow(EMAIL_CHUNK_0, EMAIL_CHUNK_1, null), "email"),
};

test("the judge prompt flags a live handbook overridden by a newer notice, with high confidence", () => {
  const prompt = buildJudgePrompt([dressCodePair]);
  assert.match(prompt, /LIVE in the help desk right now/);
  assert.match(prompt, /THIS IS A CONFLICT \(flag it, confidence 0\.85 or higher\)/);
  assert.match(prompt, /Nov 1 through the end of spring break/);
  assert.match(prompt, /Monday, November 23 through Thursday, February 25/);
  assert.match(prompt, /last year's label \(like "25\.26"\)/);
  assert.match(prompt, /IS a conflict, not a "change over time"/);
  assert.match(prompt, /include the passages just before and after/);
  // The neighbour's date range reaches the model.
  assert.match(prompt, /starting Monday, November 23 through Thursday, February 25/);
});

test("the judge prompt still excludes annual letters, recurring events, partial detail, other divisions and opinion", () => {
  const prompt = buildJudgePrompt([dressCodePair]);
  assert.match(prompt, /annual event letters, orientation schedules or preseason letters from different years/);
  assert.match(prompt, /alumni magazines, annual reports, yearbooks or student newspapers/);
  assert.match(prompt, /occurrences of a recurring event/);
  assert.match(prompt, /meets with the Division Head and PA President/);
  assert.match(prompt, /Lower School pickup vs Upper School pickup/);
  assert.match(prompt, /all-school or Middle \+ Upper School announcement DOES apply/);
  assert.match(prompt, /subjective characterization or opinion vs a fact/);
  assert.match(prompt, /Redacted or placeholder text/);
  assert.doesNotMatch(prompt, /When in doubt, it is not a conflict/);
});

const claim: Judgment = {
  is_conflict: true,
  topic: "Winter dress code dates",
  description: "Handbook: Nov 1 to spring break. Email: Nov 23 to Feb 25.",
  statement_a: "Nov 1 through the end of spring break",
  statement_b: "starting Monday, November 23 through Thursday, February 25",
  confidence: 0.9,
};

test("the verifier prompt is balanced and keeps handbook overrides as conflicts", () => {
  const prompt = buildVerifyPrompt(dressCodePair, claim);
  assert.doesNotMatch(prompt, /wrong most of the time/);
  assert.doesNotMatch(prompt, /When in doubt, answer not_conflict/);
  assert.match(prompt, /Check the claim objectively/);
  assert.match(prompt, /These ARE conflicts — answer conflict/);
  assert.match(prompt, /winter dress code runs "Nov 1 through the end of spring break"/);
  assert.match(prompt, /last year's label \(like "25\.26"\)/);
  assert.match(prompt, /does not cover a standing handbook, policy or web page against a newer notice/);
  assert.match(prompt, /Middle \+ Upper School notice DOES apply/);
  assert.match(prompt, /MSHandbook 25\.26 \(1\)/);
  assert.match(prompt, /starting Monday, November 23 through Thursday, February 25/);
});

test("the verifier keeps a conflict at 0.75 confidence", () => {
  const open = verdictFor(claim, HANDBOOK_CHUNK, dressCodePair.b.text, range);
  assert.equal(open.status, "open");
  assert.equal(applyVerification(open, { verdict: "conflict", reason: "Handbook overridden.", confidence: 0.75 })?.status, "open");
  const below = applyVerification(open, { verdict: "conflict", reason: "Maybe.", confidence: 0.74 });
  assert.deepEqual([below?.status, below?.reason], ["auto_dismissed", "verifier"]);
  const no = applyVerification(open, { verdict: "not_conflict", reason: "Different divisions.", confidence: 0.99 });
  assert.equal(no?.status, "auto_dismissed");
});

// ── Admin page labels (display.ts) ───────────────────────────────────────────

test("labels each side with its kind, date, page and divisions", () => {
  const base = { source: null, sourceUrl: null, fileType: null, createdAt: null, emailDate: null, location: null };
  assert.equal(
    originLabel({ ...base, source: "email", emailDate: "2026-11-02T14:00:00Z", createdAt: "2026-11-03T09:00:00Z" }),
    "Email · Nov 2, 2026"
  );
  assert.equal(
    originLabel({ ...base, source: "upload", fileType: "pdf", createdAt: "2026-10-12T10:00:00Z", location: "p. 10" }),
    "Uploaded PDF · Oct 12, 2026 · Page 10"
  );
  assert.equal(originLabel({ ...base, source: "website", sourceUrl: "https://school.org/x", createdAt: "2026-10-12T10:00:00Z" }), "Website page");
  assert.equal(originLabel({ ...base, sourceUrl: "https://school.org/x" }), "Website page");
  assert.equal(originLabel({ ...base, source: "upload", fileType: "docx", divisions: ["Middle School"] }), "Uploaded Word document · Middle School");
  assert.equal(originLabel({ ...base, source: "upload", fileType: "txt", location: "Slide 3" }), "Uploaded file · Slide 3");
  assert.equal(originLabel({ ...base, source: "email" }), "Email");
});

test("formats dates in UTC and ignores junk", () => {
  assert.equal(formatShortDate("2026-11-02T23:30:00Z"), "Nov 2, 2026");
  assert.equal(formatShortDate("not a date"), null);
  assert.equal(formatShortDate(null), null);
});

test("side B is newer only when more than a day newer", () => {
  const at = (iso: string | null, emailDate: string | null = null) => ({ createdAt: iso, emailDate });
  assert.equal(NEWER_MARGIN_MS, 24 * 60 * 60 * 1000);
  assert.equal(isClearlyNewer(at("2025-08-01T00:00:00Z"), at("2026-11-02T00:00:00Z")), true);
  assert.equal(isClearlyNewer(at("2026-11-01T00:00:00Z"), at("2026-11-01T23:00:00Z")), false);
  assert.equal(isClearlyNewer(at("2026-11-02T00:00:00Z"), at("2026-11-01T00:00:00Z")), false);
  // An email's sent date wins over when it was added.
  assert.equal(isClearlyNewer(at("2026-11-01T00:00:00Z"), at("2026-11-05T00:00:00Z", "2026-11-01T06:00:00Z")), false);
  assert.equal(originTime(at("2026-11-05T00:00:00Z", "2026-11-01T00:00:00Z")), Date.parse("2026-11-01T00:00:00Z"));
  assert.equal(isClearlyNewer(at(null), at("2026-11-02T00:00:00Z")), false);
});
