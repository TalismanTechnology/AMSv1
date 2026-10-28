import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UNFILED,
  cleanContactFolderName,
  contactFolderCounts,
  contactInitials,
  groupContactsByFolder,
  inFolder,
  isMissingFolderColumnError,
  matchesContactSearch,
  matchesStatusFilter,
} from "./folders";

const folders = [
  { id: "f-ath", name: "Athletics", sort_order: 1 },
  { id: "f-adm", name: "Admissions", sort_order: 0 },
  { id: "f-empty", name: "Empty", sort_order: 2 },
];

test("folder names are trimmed, collapsed and capped at a word boundary", () => {
  assert.equal(cleanContactFolderName("  Health   Services "), "Health Services");
  assert.equal(cleanContactFolderName(null), "");
  const long = cleanContactFolderName("Word ".repeat(30));
  assert.ok(long.length <= 60);
  assert.ok(!long.endsWith(" "));
});

test("counts per folder; unknown folder ids count as unfiled", () => {
  const counts = contactFolderCounts(
    [{ folder_id: "f-ath" }, { folder_id: "f-ath" }, { folder_id: null }, { folder_id: "gone" }, {}],
    folders
  );
  assert.equal(counts.total, 5);
  assert.equal(counts.unfiled, 3);
  assert.equal(counts.byFolder.get("f-ath"), 2);
  assert.equal(counts.byFolder.get("f-adm"), undefined);
});

test("folder selection: all, unfiled, one folder", () => {
  const known = new Set(folders.map((f) => f.id));
  assert.equal(inFolder({ folder_id: "f-ath" }, null, known), true);
  assert.equal(inFolder({ folder_id: "f-ath" }, UNFILED, known), false);
  assert.equal(inFolder({ folder_id: "gone" }, UNFILED, known), true);
  assert.equal(inFolder({ folder_id: null }, "f-ath", known), false);
  assert.equal(inFolder({ folder_id: "f-ath" }, "f-ath", known), true);
});

test("search matches name, role, email, topic labels and extra text, every word", () => {
  const c = { name: "Jane Smith", role: "School Nurse", email: "nurse@school.org", topics: ["health"] };
  assert.equal(matchesContactSearch(c, ""), true);
  assert.equal(matchesContactSearch(c, "jane"), true);
  assert.equal(matchesContactSearch(c, "NURSE"), true);
  assert.equal(matchesContactSearch(c, "nurse@school"), true);
  assert.equal(matchesContactSearch(c, "health"), true);
  assert.equal(matchesContactSearch(c, "jane health"), true);
  assert.equal(matchesContactSearch(c, "jane athletics"), false);
  assert.equal(matchesContactSearch(c, "lower", ["Lower School"]), true);
  assert.equal(matchesContactSearch({ ...c, topics: ["tuition_billing"] }, "billing"), true);
});

test("status filter: all hides rejected", () => {
  assert.equal(matchesStatusFilter({ status: "approved" }, "all"), true);
  assert.equal(matchesStatusFilter({ status: "suggested" }, "all"), true);
  assert.equal(matchesStatusFilter({ status: "rejected" }, "all"), false);
  assert.equal(matchesStatusFilter({ status: "suggested" }, "approved"), false);
  assert.equal(matchesStatusFilter({ status: "suggested" }, "suggested"), true);
});

test("groups by folder in folder order, empty folders dropped, Other last", () => {
  const groups = groupContactsByFolder(
    [
      { id: "1", folder_id: "f-ath" },
      { id: "2", folder_id: null },
      { id: "3", folder_id: "f-adm" },
      { id: "4", folder_id: "missing" },
    ],
    folders
  );
  assert.deepEqual(
    groups.map((g) => [g.name, g.contacts.map((c) => c.id)]),
    [
      ["Admissions", ["3"]],
      ["Athletics", ["1"]],
      ["Other", ["2", "4"]],
    ]
  );
  assert.equal(groups[2].id, null);
});

test("without folders everything is one Other group", () => {
  const groups = groupContactsByFolder([{ id: "1" }, { id: "2", folder_id: "x" }], []);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, "Other");
  assert.equal(groups[0].contacts.length, 2);
  assert.deepEqual(groupContactsByFolder([], folders), []);
});

test("initials from name, else role", () => {
  assert.equal(contactInitials({ name: "Jane Q. Smith", role: "" }), "JS");
  assert.equal(contactInitials({ name: "", role: "Main Office" }), "MO");
  assert.equal(contactInitials({ name: "Cher", role: "" }), "C");
  assert.equal(contactInitials({ name: " ", role: " " }), "?");
});

test("missing folder column is told apart from other errors", () => {
  assert.equal(isMissingFolderColumnError({ code: "42703", message: "column school_contacts.folder_id does not exist" }), true);
  assert.equal(isMissingFolderColumnError({ code: "PGRST204", message: "" }), true);
  assert.equal(isMissingFolderColumnError({ code: "42P01", message: "relation does not exist" }), false);
  assert.equal(isMissingFolderColumnError({ code: "42501", message: "permission denied" }), false);
  assert.equal(isMissingFolderColumnError(null), false);
});
