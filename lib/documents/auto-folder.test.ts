import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoFolderCandidates,
  cleanFolderName,
  isProtectedFolderName,
  protectedFolderIds,
  reusableRootFolders,
  sanitizeAutoFolderProposal,
  type AutoFolderDoc,
  type AutoFolderFolder,
} from "./auto-folder";

const SCHOOL = "school-a";
const OTHER = "school-b";

const folders: AutoFolderFolder[] = [
  { id: "athletics", name: "Athletics", parent_id: null, school_id: SCHOOL },
  { id: "forms", name: "Forms", parent_id: "athletics", school_id: SCHOOL },
  { id: "website", name: "website", parent_id: null, school_id: SCHOOL },
  { id: "web-news", name: "News", parent_id: "website", school_id: SCHOOL },
  { id: "responses", name: "Responses", parent_id: null, school_id: SCHOOL },
  { id: "resp-sub", name: "Older", parent_id: "responses", school_id: SCHOOL },
  { id: "other-school", name: "Admissions", parent_id: null, school_id: OTHER },
];

const doc = (id: string, extra: Partial<AutoFolderDoc> = {}): AutoFolderDoc => ({
  id,
  title: `Doc ${id}`,
  school_id: SCHOOL,
  folder_id: null,
  source: "upload",
  status: "ready",
  ...extra,
});

const docs: AutoFolderDoc[] = [
  doc("u1"),
  doc("u2", { source: "email" }),
  doc("filed", { folder_id: "forms" }),
  doc("in-website", { folder_id: "web-news" }),
  doc("in-responses", { folder_id: "resp-sub" }),
  doc("synced", { source: "website" }),
  doc("processing", { status: "processing" }),
  doc("foreign", { school_id: OTHER }),
  doc("foreign-folder", { folder_id: "other-school" }),
];

test("protected names match Website and Responses in any case", () => {
  assert.equal(isProtectedFolderName("WEBSITE"), true);
  assert.equal(isProtectedFolderName("  responses "), true);
  assert.equal(isProtectedFolderName("Website."), true);
  assert.equal(isProtectedFolderName("Website News"), false);
});

test("protected folders include their subfolders", () => {
  assert.deepEqual(
    [...protectedFolderIds(folders)].sort(),
    ["resp-sub", "responses", "web-news", "website"]
  );
});

test("cleans folder names", () => {
  assert.equal(cleanFolderName('  "Health   &  Safety" '), "Health & Safety");
  assert.equal(cleanFolderName("Athletics/Forms"), "Athletics - Forms");
  assert.equal(cleanFolderName("   "), "");
  const long = cleanFolderName("Calendar Transportation School Life and Everything Else That Matters Here");
  assert.ok(long.length <= 60, long);
  assert.ok(!long.endsWith(" "));
});

test("unfiled scope: only this school's ready, non-website, folderless docs", () => {
  const ids = autoFolderCandidates(docs, folders, SCHOOL, "unfiled").map((d) => d.id);
  assert.deepEqual(ids, ["u1", "u2"]);
});

test("all scope adds filed docs, but never Website/Responses or other schools' folders", () => {
  const ids = autoFolderCandidates(docs, folders, SCHOOL, "all").map((d) => d.id);
  assert.deepEqual(ids, ["u1", "u2", "filed"]);
});

test("reusable roots skip protected, subfolders and other schools", () => {
  assert.deepEqual(
    reusableRootFolders(folders, SCHOOL).map((f) => f.id),
    ["athletics"]
  );
});

test("reuses existing root folders by name, ignoring case, and dedupes new names", () => {
  const plan = sanitizeAutoFolderProposal({
    schoolId: SCHOOL,
    scope: "all",
    folders,
    docs,
    proposal: {
      assignments: [
        { documentId: "u1", folder: "athletics" },
        { documentId: "u2", folder: "Parents Association" },
        { documentId: "filed", folder: "PARENTS association " },
      ],
    },
  });
  assert.deepEqual(plan.folders, [
    { name: "Parents Association", existingId: null, count: 2 },
    { name: "Athletics", existingId: "athletics", count: 1 },
  ]);
  assert.deepEqual(
    plan.moves.map((m) => [m.documentId, m.folder, m.fromFolderId]),
    [
      ["u1", "Athletics", null],
      ["u2", "Parents Association", null],
      ["filed", "Parents Association", "forms"],
    ]
  );
});

test("never targets Website or Responses", () => {
  const plan = sanitizeAutoFolderProposal({
    schoolId: SCHOOL,
    scope: "unfiled",
    folders,
    docs,
    proposal: {
      assignments: [
        { documentId: "u1", folder: "Website" },
        { documentId: "u2", folder: "responses" },
      ],
    },
  });
  assert.deepEqual(plan.moves, []);
  assert.deepEqual(plan.folders, []);
  assert.equal(plan.skipped.length, 2);
});

test("skips unknown, foreign, protected, website-synced and out-of-scope docs", () => {
  const plan = sanitizeAutoFolderProposal({
    schoolId: SCHOOL,
    scope: "unfiled",
    folders,
    docs,
    proposal: {
      assignments: [
        { documentId: "nope", folder: "Athletics" },
        { documentId: "foreign", folder: "Athletics" },
        { documentId: "in-website", folder: "Athletics" },
        { documentId: "in-responses", folder: "Athletics" },
        { documentId: "synced", folder: "Athletics" },
        { documentId: "processing", folder: "Athletics" },
        { documentId: "filed", folder: "Athletics" }, // filed, scope is unfiled
        { documentId: "u1", folder: "Athletics" },
        { documentId: "u1", folder: "Elsewhere" }, // repeat
      ],
    },
  });
  assert.deepEqual(plan.moves.map((m) => m.documentId), ["u1"]);
  assert.equal(plan.skipped.length, 8);
});

test("drops moves into the folder a doc is already in", () => {
  const atRoot = [...docs, doc("at-root", { folder_id: "athletics" })];
  const plan = sanitizeAutoFolderProposal({
    schoolId: SCHOOL,
    scope: "all",
    folders,
    docs: atRoot,
    proposal: { assignments: [{ documentId: "at-root", folder: "Athletics" }] },
  });
  assert.deepEqual(plan.moves, []);
  assert.deepEqual(plan.skipped, [{ documentId: "at-root", reason: "already in that folder" }]);
});

test("caps the number of folders, keeping the most used", () => {
  const many = Array.from({ length: 5 }, (_, i) => doc(`m${i}`));
  const plan = sanitizeAutoFolderProposal({
    schoolId: SCHOOL,
    scope: "unfiled",
    folders,
    docs: many,
    maxFolders: 2,
    proposal: {
      assignments: [
        { documentId: "m0", folder: "Big" },
        { documentId: "m1", folder: "Big" },
        { documentId: "m2", folder: "Small" },
        { documentId: "m3", folder: "Athletics" },
        { documentId: "m4", folder: "Tiny" },
      ],
    },
  });
  // Big (2) first; Athletics wins the tie with Small/Tiny as an existing folder.
  assert.deepEqual(plan.folders.map((f) => f.name), ["Big", "Athletics"]);
  assert.deepEqual(plan.moves.map((m) => m.documentId), ["m0", "m1", "m3"]);
});

test("ignores a foreign school's folder of the same name", () => {
  const plan = sanitizeAutoFolderProposal({
    schoolId: SCHOOL,
    scope: "unfiled",
    folders,
    docs,
    proposal: { assignments: [{ documentId: "u1", folder: "Admissions" }] },
  });
  assert.deepEqual(plan.folders, [{ name: "Admissions", existingId: null, count: 1 }]);
});
