import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ROSTER_BYTES,
  MAX_ROSTER_ROWS,
  ROSTER_TEMPLATE_CSV,
  isValidEmail,
  normalizeChildName,
  normalizeRosterGrade,
  parseCsvRecords,
  parseRosterCsv,
} from "./csv";

// ── CSV records ──────────────────────────────────────────

test("quoted fields keep commas, newlines and doubled quotes", () => {
  const records = parseCsvRecords('a,b,c\r\n"x, y","say ""hi""","two\r\nlines"\r\nlast,row,here\r\n');
  assert.deepEqual(
    records.map((record) => record.fields),
    [
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "two\nlines"],
      ["last", "row", "here"],
    ]
  );
  // The record after a two-line field starts on line 4.
  assert.deepEqual(records.map((record) => record.line), [1, 2, 4]);
});

test("BOM, LF / CR line endings and trailing blank lines", () => {
  const records = parseCsvRecords("﻿email,name\nA@x.com,Ann\rb@x.com,Bo\n\n\n");
  assert.deepEqual(records.map((record) => record.fields), [
    ["email", "name"],
    ["A@x.com", "Ann"],
    ["b@x.com", "Bo"],
  ]);
});

test("semicolon- and tab-delimited exports are detected from the header", () => {
  assert.deepEqual(parseCsvRecords("email;name\na@x.com;Ann, Jr")[1].fields, ["a@x.com", "Ann, Jr"]);
  assert.deepEqual(parseCsvRecords("email\tname\na@x.com\tAnn")[1].fields, ["a@x.com", "Ann"]);
});

test("a last line without a newline and an empty last field are kept", () => {
  assert.deepEqual(parseCsvRecords("a,b\n1,")[1].fields, ["1", ""]);
});

// ── grades ───────────────────────────────────────────────

test("grade spellings map onto lib/grades.ts values", () => {
  const cases: [string, string][] = [
    ["K", "K"],
    ["k", "K"],
    ["Kindergarten", "K"],
    ["KG", "K"],
    ["Grade K", "K"],
    ["PK", "Pre-K"],
    ["Pre-K", "Pre-K"],
    ["PreK", "Pre-K"],
    ["pre k", "Pre-K"],
    ["Pre-Kindergarten", "Pre-K"],
    ["1", "1"],
    ["01", "1"],
    ["1st", "1"],
    ["Grade 1", "1"],
    ["1st Grade", "1"],
    ["Gr. 5", "5"],
    ["first", "1"],
    ["Third Grade", "3"],
    ["12", "12"],
    ["12th", "12"],
    ["twelfth", "12"],
  ];
  for (const [raw, grade] of cases) {
    assert.deepEqual(normalizeRosterGrade(raw), { grade, recognized: true }, raw);
  }
});

test("empty grades are fine; unknown grades are flagged, not guessed", () => {
  assert.deepEqual(normalizeRosterGrade(""), { grade: null, recognized: true });
  assert.deepEqual(normalizeRosterGrade("   "), { grade: null, recognized: true });
  assert.deepEqual(normalizeRosterGrade(null), { grade: null, recognized: true });
  for (const raw of ["13", "0", "Year 3", "Senior", "-1", "3rd-4th"]) {
    assert.deepEqual(normalizeRosterGrade(raw), { grade: null, recognized: false }, raw);
  }
});

// ── emails / names ───────────────────────────────────────

test("email validation", () => {
  assert.equal(isValidEmail("jane.smith+school@example.co.uk"), true);
  assert.equal(isValidEmail("jane@example"), false);
  assert.equal(isValidEmail("jane@@example.com"), false);
  assert.equal(isValidEmail("jane smith@example.com"), false);
  assert.equal(isValidEmail("a@x.com;b@x.com"), false);
  assert.equal(isValidEmail("jane..smith@example.com"), false);
  assert.equal(isValidEmail(`${"a".repeat(250)}@x.com`), false);
});

test("child names match case- and space-insensitively", () => {
  assert.equal(normalizeChildName("  Ava   SMITH "), "ava smith");
});

// ── roster parsing ───────────────────────────────────────

test("one row per child groups into one parent, children deduped, last grade wins", () => {
  const result = parseRosterCsv(
    [
      "Parent Email,Parent First Name,Parent Last Name,Child Name,Child Grade",
      "Jane.Smith@Example.com ,Jane,Smith,Ava Smith,2",
      "jane.smith@example.com,,,Leo Smith,K",
      "jane.smith@example.com,Janet,Smyth,ava  smith,3",
      "bob@example.com,Bob,Jones,,",
    ].join("\n")
  );

  assert.equal(result.fatal, null);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.parents, [
    {
      email: "jane.smith@example.com",
      firstName: "Jane",
      lastName: "Smith",
      children: [
        { name: "Ava Smith", grade: "3" },
        { name: "Leo Smith", grade: "K" },
      ],
    },
    { email: "bob@example.com", firstName: "Bob", lastName: "Jones", children: [] },
  ]);
  assert.deepEqual(result.stats, { rows: 4, parents: 2, children: 2, rowsWithErrors: 0 });
});

test("a later row without a grade doesn't erase a known grade", () => {
  const result = parseRosterCsv("email,child,grade\na@x.com,Ava,4\na@x.com,Ava,\n");
  assert.deepEqual(result.parents[0].children, [{ name: "Ava", grade: "4" }]);
});

test("wide format: child1_name / child1_grade … childN", () => {
  const result = parseRosterCsv(
    [
      "e-mail,full_name,child1_name,child1_grade,child2_first_name,child2_last_name,child2_grade,child3",
      'a@x.com,"Smith, Jane",Ava,1st,Leo,Smith,Pre-K,',
    ].join("\n")
  );
  assert.deepEqual(result.parents, [
    {
      email: "a@x.com",
      firstName: "Jane",
      lastName: "Smith",
      children: [
        { name: "Ava", grade: "1" },
        { name: "Leo Smith", grade: "Pre-K" },
      ],
    },
  ]);
});

test("header aliases: guardian_email, name split, student columns", () => {
  const result = parseRosterCsv(
    "Guardian_Email,Name,Student First Name,Student Last Name,Student Grade\nb@x.com,Mary Ann Lee,Kim,Lee,Grade 7\n"
  );
  assert.deepEqual(result.parents[0], {
    email: "b@x.com",
    firstName: "Mary Ann",
    lastName: "Lee",
    children: [{ name: "Kim Lee", grade: "7" }],
  });
});

test("bad rows are reported with their line numbers and skipped", () => {
  const result = parseRosterCsv(
    [
      "email,first_name,child_name,grade",
      "good@x.com,Ann,Ava,3",
      ",Nobody,Kid,2",
      "not-an-email,Bad,Kid,2",
      '"two@x.com; three@x.com",Pair,Kid,2',
      `long@x.com,${"n".repeat(201)},Kid,2`,
      "",
      "ok@x.com,Ok,Sam,Year 3",
    ].join("\n")
  );

  assert.deepEqual(
    result.errors.map((issue) => issue.line),
    [3, 4, 5, 6]
  );
  assert.match(result.errors[0].message, /Missing email/);
  assert.match(result.errors[1].message, /isn't a valid email/);
  assert.match(result.errors[2].message, /one email address per row/);
  assert.match(result.errors[3].message, /longer than 200/);

  // Unknown grade: kept, without a grade, with a warning on line 8.
  assert.deepEqual(result.warnings.map((issue) => issue.line), [8]);
  assert.match(result.warnings[0].message, /Year 3/);
  assert.deepEqual(
    result.parents.map((parent) => parent.email),
    ["good@x.com", "ok@x.com"]
  );
  assert.deepEqual(result.parents[1].children, [{ name: "Sam", grade: null }]);
  assert.equal(result.stats.rowsWithErrors, 4);
});

test("a grade with no child name is ignored with a warning", () => {
  const result = parseRosterCsv("email,grade\na@x.com,3\n");
  assert.equal(result.parents[0].children.length, 0);
  assert.equal(result.warnings.length, 1);
});

test("files without an email column, empty files and oversized files are rejected", () => {
  assert.match(parseRosterCsv("name,grade\nJane,3\n").fatal ?? "", /No email column/);
  assert.match(parseRosterCsv("").fatal ?? "", /empty/);
  assert.match(parseRosterCsv("\n\n").fatal ?? "", /empty/);
  assert.match(parseRosterCsv(`email\n${"a".repeat(MAX_ROSTER_BYTES)}`).fatal ?? "", /900 KB/);

  const tooMany = ["email", ...Array.from({ length: MAX_ROSTER_ROWS + 1 }, (_, i) => `p${i}@x.com`)];
  assert.match(parseRosterCsv(tooMany.join("\n")).fatal ?? "", /limit is 10,000/);

  const atLimit = ["email", ...Array.from({ length: MAX_ROSTER_ROWS }, (_, i) => `p${i}@x.com`)];
  assert.equal(parseRosterCsv(atLimit.join("\n")).parents.length, MAX_ROSTER_ROWS);
});

test("the downloadable template parses cleanly", () => {
  const result = parseRosterCsv(ROSTER_TEMPLATE_CSV);
  assert.equal(result.fatal, null);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.parents.length, 1);
  assert.equal(result.parents[0].children.length, 2);
});
