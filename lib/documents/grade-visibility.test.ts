import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canViewDocument,
  conflictsInReach,
  formatVisibleGrades,
  groupRecipientsByVisibleDocuments,
  isForAllParents,
  mergeVisibleGrades,
  normalizeVisibleGrades,
  sortGrades,
  viewerFor,
  ALL_DOCUMENTS_VIEWER,
} from "./grade-visibility";

const GRADE_10_ONLY = ["10"];
const grade9Parent = viewerFor({ isAdmin: false, children: [{ grade: "9" }] });
const grade10Parent = viewerFor({ isAdmin: false, children: [{ grade: "10" }] });

test("a grade-9 parent can't see a grade-10-only document; a grade-10 parent can", () => {
  assert.equal(canViewDocument(GRADE_10_ONLY, grade9Parent), false);
  assert.equal(canViewDocument(GRADE_10_ONLY, grade10Parent), true);
});

test("documents for all parents are visible to everyone", () => {
  for (const grades of [null, undefined, []]) {
    assert.equal(isForAllParents(grades), true);
    assert.equal(canViewDocument(grades, grade9Parent), true);
    assert.equal(canViewDocument(grades, viewerFor({ isAdmin: false, children: [] })), true);
  }
});

test("a parent with no children on file sees only documents for all parents", () => {
  const viewer = viewerFor({ isAdmin: false, children: [] });
  assert.deepEqual(viewer, { seeAll: false, grades: [] });
  assert.equal(canViewDocument(["6", "7", "8"], viewer), false);
  assert.equal(canViewDocument(null, viewer), true);
});

test("graduated children don't count", () => {
  const viewer = viewerFor({ isAdmin: false, children: [{ grade: "12", graduated: true }] });
  assert.equal(canViewDocument(["12"], viewer), false);
});

test("any one child's grade is enough; unknown grades are ignored", () => {
  const viewer = viewerFor({
    isAdmin: false,
    children: [{ grade: "3" }, { grade: "7" }, { grade: "Grade Seven" }, { grade: null }],
  });
  assert.deepEqual(viewer, { seeAll: false, grades: ["3", "7"] });
  assert.equal(canViewDocument(["6", "7", "8"], viewer), true);
  assert.equal(canViewDocument(["9"], viewer), false);
});

test("admins see everything", () => {
  assert.deepEqual(viewerFor({ isAdmin: true, children: [] }), ALL_DOCUMENTS_VIEWER);
  assert.equal(canViewDocument(GRADE_10_ONLY, ALL_DOCUMENTS_VIEWER), true);
});

test("normalizeVisibleGrades orders, dedupes and treats empty as all parents", () => {
  assert.deepEqual(normalizeVisibleGrades(["8", "K", "6", "8", "Pre-K"]), {
    grades: ["Pre-K", "K", "6", "8"],
  });
  assert.deepEqual(normalizeVisibleGrades([]), { grades: null });
  assert.deepEqual(normalizeVisibleGrades(null), { grades: null });
  assert.deepEqual(normalizeVisibleGrades(undefined), { grades: null });
});

test("normalizeVisibleGrades rejects unknown values rather than dropping them", () => {
  assert.ok("error" in normalizeVisibleGrades(["9", "13"]));
  assert.ok("error" in normalizeVisibleGrades(["9", 10]));
  assert.ok("error" in normalizeVisibleGrades("9"));
});

test("mergeVisibleGrades: all parents wins, otherwise the union", () => {
  assert.deepEqual(mergeVisibleGrades(["9"], ["10"]), ["9", "10"]);
  assert.equal(mergeVisibleGrades(["9"], null), null);
  assert.equal(mergeVisibleGrades([], ["9"]), null);
});

test("formatVisibleGrades", () => {
  assert.equal(formatVisibleGrades(null), "All parents");
  assert.equal(formatVisibleGrades(["9"]), "Grade 9");
  assert.equal(formatVisibleGrades(["K"]), "Kindergarten");
  assert.equal(formatVisibleGrades(["8", "6", "7"]), "Grades 6–8");
  assert.equal(formatVisibleGrades(["Pre-K", "K"]), "Pre-K–K");
  assert.equal(formatVisibleGrades(["K", "3", "6", "7", "8"]), "Grades K, 3, 6–8");
  assert.equal(formatVisibleGrades(sortGrades(["Pre-K", "K", ...Array.from({ length: 12 }, (_, i) => String(i + 1))])), "All grades");
});

test("push: a grade-9 parent is never told about a grade-10-only document", () => {
  const docs = [
    { id: "open", visibleGrades: null },
    { id: "g10", visibleGrades: ["10"] },
  ];
  const children = new Map([
    ["p9", [{ grade: "9" }]],
    ["p10", [{ grade: "10" }]],
    ["none", []],
  ]);
  const groups = groupRecipientsByVisibleDocuments(docs, ["p9", "p10", "none", "unknown"], children);
  const docsFor = (parent: string) =>
    groups.find((g) => g.recipients.includes(parent))?.documents.map((d) => d.id);
  assert.deepEqual(docsFor("p9"), ["open"]);
  assert.deepEqual(docsFor("p10"), ["open", "g10"]);
  assert.deepEqual(docsFor("none"), ["open"]);
  assert.deepEqual(docsFor("unknown"), ["open"]);
});

test("push: parents who can see none of the batch get nothing", () => {
  const groups = groupRecipientsByVisibleDocuments(
    [{ id: "g10", visibleGrades: ["10"] }],
    ["p9", "p10"],
    new Map([
      ["p9", [{ grade: "9" }]],
      ["p10", [{ grade: "10", graduated: true }]],
    ])
  );
  assert.deepEqual(groups, []);
});

test("conflict rulings that quote a document outside the viewer's reach are dropped", () => {
  const conflicts = [
    { id: "both-reached", a: { document_id: "d1" }, b: { document_id: "d2" } },
    { id: "other-open", a: { document_id: "d1" }, b: { document_id: "open" } },
    { id: "other-restricted", a: { document_id: "d1" }, b: { document_id: "g10" } },
  ];
  const kept = conflictsInReach(conflicts, new Set(["d1", "d2"]), new Set(["open"]));
  assert.deepEqual(
    kept.map((c) => c.id),
    ["both-reached", "other-open"]
  );
});
