import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeYearClues,
  differentYearEvidence,
  explicitYearsDiffer,
  findExplicitYears,
  findWeekdayDates,
  schoolYearOf,
  statementsDifferInYear,
  weekdayDatesDiffer,
  yearRange,
} from "./years";
import { filterCandidates, type CandidatePair } from "./candidates";
import { buildJudgePrompt, verdictFor, MIN_CONFLICT_CONFIDENCE, type Judgment } from "./judge";

// The dry run that prompted this: today is October 2026.
const range = yearRange(new Date("2026-10-20T12:00:00Z"));

test("the year range is four years back and one ahead", () => {
  assert.deepEqual(range, { min: 2022, max: 2027 });
});

test("finds weekday dates in the common ways schools write them", () => {
  const years = (text: string) => findWeekdayDates(text, range).map((d) => [d.month, d.day, d.years]);
  assert.deepEqual(years("Wednesday, September 3: Middle School classes begin"), [[9, 3, [2025]]]);
  assert.deepEqual(years("Wednesday, September 9: Middle School classes begin"), [[9, 9, [2026]]]);
  assert.deepEqual(years("Buses start running on Monday, September 8 ."), [[9, 8, [2025]]]);
  assert.deepEqual(years("Wed., Sept. 3"), [[9, 3, [2025]]]);
  assert.deepEqual(years("Wed Sep 3rd"), [[9, 3, [2025]]]);
  assert.deepEqual(years("Monday 9/8 is the first day"), [[9, 8, [2025]]]);
  assert.deepEqual(years("Mon. (9/14)"), [[9, 14, [2026]]]);
  assert.deepEqual(years("Wednesday, 3 September"), [[9, 3, [2025]]]);
  assert.deepEqual(years("Wednesday the 3rd of September"), [[9, 3, [2025]]]);
  assert.deepEqual(years("September 3 (Wednesday)"), [[9, 3, [2025]]]);
  assert.deepEqual(years("9/9 (Wed.)"), [[9, 9, [2026]]]);
});

test("a written year decides, if the weekday fits it", () => {
  assert.deepEqual(findWeekdayDates("Saturday, August 24, 2024", range).map((d) => d.years), [[2024]]);
  // Out of range, but written out.
  assert.deepEqual(findWeekdayDates("Tuesday, September 3, 2019", range).map((d) => d.years), [[2019]]);
  // The weekday doesn't fit the year written: a typo, ignored.
  assert.deepEqual(findWeekdayDates("Monday, September 3, 2025", range), []);
});

test("ignores weekday words that aren't a date's weekday", () => {
  assert.deepEqual(findWeekdayDates("Monday–Friday, September 8–12", range), []);
  assert.deepEqual(findWeekdayDates("Mon through Fri, Sept 8", range), []);
  assert.deepEqual(findWeekdayDates("every Monday, September through June", range), []);
  assert.deepEqual(findWeekdayDates("Montclair September 3", range), []);
  assert.deepEqual(findWeekdayDates("Wednesday, February 30", range), []);
  assert.deepEqual(findWeekdayDates("Wednesday, September 31", range), []);
});

test("a date can fit two years in the range", () => {
  const [d] = findWeekdayDates("Friday, March 3", yearRange(new Date("2027-06-01")));
  assert.deepEqual(d.years, [2023, 2028]);
});

test("school years start in July", () => {
  assert.equal(schoolYearOf(2025, 9), 2025);
  assert.equal(schoolYearOf(2026, 6), 2025);
  assert.equal(schoolYearOf(2026, 7), 2026);
});

test("weekday dates in different school years differ; one school year's calendar doesn't", () => {
  const d = (text: string) => findWeekdayDates(text, range);
  assert.equal(weekdayDatesDiffer(d("Wednesday, September 3"), d("Wednesday, September 9")), true);
  assert.equal(
    weekdayDatesDiffer(d("Monday, September 8. Wednesday, September 3."), d("Monday, September 14")),
    true
  );
  // September 2025 and June 2026 are one school year.
  assert.equal(weekdayDatesDiffer(d("Wednesday, September 3"), d("Friday, June 12")), false);
  assert.equal(weekdayDatesDiffer(d("Wednesday, September 3"), d("Wed., Sept. 3")), false);
  // Nothing to compare on one side.
  assert.equal(weekdayDatesDiffer(d("Wednesday, September 3"), []), false);
  // One side spans two school years, the other is in one of them.
  assert.equal(
    weekdayDatesDiffer(d("Wednesday, September 3 and Wednesday, September 9"), d("Wednesday, September 9")),
    false
  );
});

test("finds explicit years and school years", () => {
  assert.deepEqual(findExplicitYears("2024SoccerPreseasonInfoletter"), { schoolYears: [], years: [2024] });
  assert.deepEqual(findExplicitYears("MSHandbook 25.26 (1)"), { schoolYears: [2025], years: [] });
  assert.deepEqual(findExplicitYears("2026-27 Parents Association Handbook"), { schoolYears: [2026], years: [] });
  assert.deepEqual(findExplicitYears("Calendar 2025–2026"), { schoolYears: [2025], years: [] });
  assert.deepEqual(findExplicitYears("SY 2025/26"), { schoolYears: [2025], years: [] });
  assert.deepEqual(findExplicitYears("Collegiate Magazine Fall 2025 - 2024-2025 Annual Giving Report"), {
    schoolYears: [2024],
    years: [2025],
  });
  // Not school years: day ranges, prices, other numbers.
  assert.deepEqual(findExplicitYears("August 25-26 and Sept. 19-20"), { schoolYears: [], years: [] });
  assert.deepEqual(findExplicitYears("Fee: $25.26; grades 10-11; rooms 12-14"), { schoolYears: [], years: [] });
  assert.deepEqual(findExplicitYears("Class of 1950; call 10024"), { schoolYears: [], years: [] });
});

test("explicit years differ by school year when both have one, else by calendar year", () => {
  const e = findExplicitYears;
  assert.equal(explicitYearsDiffer(e("MSHandbook 25.26"), e("2026-27 Handbook")), true);
  assert.equal(explicitYearsDiffer(e("2026-27 Handbook"), e("2026-27 Slate")), false);
  assert.equal(explicitYearsDiffer(e("2024 Soccer"), e("2026 Soccer")), true);
  assert.equal(explicitYearsDiffer(e("2026-27 Handbook"), e("Slate 2026")), false);
  assert.equal(explicitYearsDiffer(e("2024 Soccer"), e("Important Preseason Soccer Information")), false);
});

test("different-year evidence: titles first, then weekday dates, falling back to the document's", () => {
  assert.match(
    differentYearEvidence(
      { title: "2024 Soccer Preseason", text: "Tryouts at Randall's Island" },
      { title: "2026 Soccer Preseason", text: "Tryouts at school" },
      range
    ) ?? "",
    /^Titles name different years/
  );
  const evidence = differentYearEvidence(
    { title: "Hassan Jones 8 20 25 orientation email.pdf", text: "Wednesday, September 3 : Middle School classes begin" },
    { title: "Welcome Back to Middle School", text: "Wednesday, September 9: Middle School classes begin" },
    range
  );
  assert.equal(
    evidence,
    'Weekday dates fit different school years: "Wednesday, September 3" (2025) vs "Wednesday, September 9" (2026).'
  );
  // "week of August 25" has no weekday: the rest of each document decides.
  const a = { title: "Orientation", text: "view your schedule starting the week of August 25." };
  const b = { title: "Welcome Back", text: "view your schedule starting the week of August 31." };
  assert.equal(differentYearEvidence(a, b, range), null);
  assert.notEqual(
    differentYearEvidence(
      { ...a, documentDates: findWeekdayDates("Monday, September 8", range) },
      { ...b, documentDates: findWeekdayDates("Monday, September 14", range) },
      range
    ),
    null
  );
  // Same school year, different wording: judged as usual.
  assert.equal(
    differentYearEvidence(
      { title: "Handbook 2025-26", text: "Wednesday, September 3: classes begin" },
      { title: "Welcome letter", text: "Classes begin Wed., Sept. 3." },
      range
    ),
    null
  );
});

test("statements dated to different years", () => {
  assert.equal(
    statementsDifferInYear(
      "Mario’s private bus starts running on Monday, September 8 .",
      "Mario’s Private Bus starts running on Monday, September 14.",
      range
    ),
    true
  );
  assert.equal(statementsDifferInYear("The 2024 tryouts", "The 2026 tryouts", range), true);
  assert.equal(statementsDifferInYear("Pickup is at 3:00 PM", "Pickup is at 3:15 PM", range), false);
  assert.equal(statementsDifferInYear("Monday, September 8", "Tuesday, September 9", range), false);
});

test("year clues for the prompt", () => {
  assert.equal(
    describeYearClues(
      { title: "2024SoccerPreseasonInfoletter", text: "First session Saturday, August 24 for the 2024-25 season" },
      range
    ),
    'Years in title: 2024 · Years in excerpt: 2024-25 · Weekday dates: "Saturday, August 24" matches 2024'
  );
  assert.equal(
    describeYearClues(
      { title: "Orientation", text: "week of August 25", documentDates: findWeekdayDates("Monday, September 8", range) },
      range
    ),
    "Weekday dates elsewhere in this document match 2025"
  );
  assert.equal(describeYearClues({ title: "Pickup", text: "Pickup is at 3:00 PM" }, range), "");
});

// ── Wiring: candidates, verdicts and the prompt ─────────────────────────────

test("filterCandidates sets different-year pairs apart without counting them against the limit", () => {
  const pairs: CandidatePair[] = [
    { chunk_a_id: "a1", chunk_b_id: "b1", document_a_id: "A", document_b_id: "B", similarity: 0.93 },
    { chunk_a_id: "a2", chunk_b_id: "c1", document_a_id: "A", document_b_id: "C", similarity: 0.92 },
  ];
  const chunks = new Map([
    ["a1", { content: "Wednesday, September 3: Middle School classes begin" }],
    ["b1", { content: "Wednesday, September 9: Middle School classes begin" }],
    ["a2", { content: "Pickup is at 3:00 PM" }],
    ["c1", { content: "Pickup is at 3:15 PM" }],
  ]);
  const { selected, differentYear, skipped } = filterCandidates(
    pairs,
    {
      documents: new Map(),
      chunks,
      judged: new Set(),
      differentYear: (_c, a, b) =>
        differentYearEvidence({ title: "", text: a }, { title: "", text: b }, range) !== null,
    },
    { limit: 1 }
  );
  assert.deepEqual(selected.map((c) => c.chunk_a_id), ["a2"]);
  assert.deepEqual(differentYear.map((c) => c.chunk_a_id), ["a1"]);
  assert.equal(skipped.different_year, 1);
  assert.equal(skipped.over_limit, 0);
});

const judgment = (over: Partial<Judgment> = {}): Judgment => ({
  is_conflict: true,
  topic: "Bus start",
  description: "",
  statement_a: "starts running on Monday, September 8",
  statement_b: "starts running on Monday, September 14",
  confidence: 1,
  ...over,
});

test("the verdict vetoes a conflict whose quotes date to different years", () => {
  const v = verdictFor(
    judgment(),
    "Bus starts running on Monday, September 8 .",
    "Bus starts running on Monday, September 14.",
    range
  );
  assert.deepEqual([v.status, v.reason], ["auto_dismissed", "different_year"]);
});

test("open conflicts need confidence of at least 0.8", () => {
  assert.equal(MIN_CONFLICT_CONFIDENCE, 0.8);
  const a = "Pickup is at 3:00 PM";
  const b = "Pickup is at 3:15 PM";
  const at = (confidence: number) =>
    verdictFor(judgment({ statement_a: a, statement_b: b, confidence }), a, b, range);
  assert.deepEqual([at(0.79).status, at(0.79).reason], ["auto_dismissed", "low_confidence"]);
  assert.equal(at(0.8).status, "open");
});

test("the judge prompt carries each side's source and year clues", () => {
  const prompt = buildJudgePrompt([
    {
      a: {
        documentTitle: "Hassan Jones 8 20 25 orientation email.pdf",
        documentDates: "added 2025-08-21",
        source: "upload",
        yearClues: '"Wednesday, September 3" matches 2025',
        divisions: [],
        location: null,
        text: "Wednesday, September 3 : Middle School classes begin",
      },
      b: {
        documentTitle: "Welcome Back to Middle School",
        documentDates: "email sent 2026-08-28",
        source: "email",
        divisions: [],
        location: null,
        text: "Wednesday, September 9: Middle School classes begin",
      },
    },
  ]);
  assert.match(prompt, /Document: "Hassan Jones 8 20 25 orientation email\.pdf" \| Source: upload \| Dates: added 2025-08-21\nYear clues: "Wednesday, September 3" matches 2025\n<excerpt_a>/);
  assert.match(prompt, /Document: "Welcome Back to Middle School" \| Source: email \| Dates: email sent 2026-08-28\n<excerpt_b>/);
  assert.match(prompt, /different school years, seasons or editions, it is NOT a conflict/);
  assert.match(prompt, /give a low confidence/);
});
