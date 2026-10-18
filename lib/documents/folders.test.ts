import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UNFILED,
  autoSortFolderCandidates,
  buildFolderTree,
  descendantIds,
  filterByFolderSelection,
  findWebsiteFolder,
  folderDocumentCounts,
} from "./folders";

const folders = [
  { id: "sports", name: "sports", parent_id: null },
  { id: "admissions", name: "Admissions", parent_id: null },
  { id: "fall", name: "Fall", parent_id: "sports" },
  { id: "basketball", name: "Basketball", parent_id: "fall" },
  { id: "website", name: "Website", parent_id: null },
  { id: "web-news", name: "News", parent_id: "website" },
  { id: "responses", name: "Responses", parent_id: null },
  { id: "athletics", name: "Athletics", parent_id: "sports" },
];

test("sorts every level of the tree alphabetically, ignoring case", () => {
  const tree = buildFolderTree(folders);
  assert.deepEqual(
    tree.map((f) => f.name),
    ["Admissions", "Responses", "sports", "Website"]
  );
  const sports = tree.find((f) => f.id === "sports")!;
  assert.deepEqual(sports.children.map((f) => f.name), ["Athletics", "Fall"]);
  assert.deepEqual(sports.children[1].children.map((f) => f.id), ["basketball"]);
});

test("puts a folder whose parent is missing at the root", () => {
  const tree = buildFolderTree([{ id: "orphan", name: "Orphan", parent_id: "gone" }]);
  assert.deepEqual(tree.map((f) => f.id), ["orphan"]);
});

test("collects descendants and survives a parent cycle", () => {
  assert.deepEqual([...descendantIds(folders, "sports")].sort(), [
    "athletics",
    "basketball",
    "fall",
    "sports",
  ]);
  const cycle = [
    { id: "a", name: "A", parent_id: "b" },
    { id: "b", name: "B", parent_id: "a" },
  ];
  assert.deepEqual([...descendantIds(cycle, "a")].sort(), ["a", "b"]);
});

const docs = [
  { id: "1", folder_id: "basketball" },
  { id: "2", folder_id: "fall" },
  { id: "3", folder_id: "sports" },
  { id: "4", folder_id: null },
  { id: "5", folder_id: null },
  { id: "6", folder_id: "web-news" },
];

test("counts documents per folder including descendants, plus total and unfiled", () => {
  const counts = folderDocumentCounts(folders, docs);
  assert.equal(counts.total, 6);
  assert.equal(counts.unfiled, 2);
  assert.equal(counts.byFolder.get("sports"), 3);
  assert.equal(counts.byFolder.get("fall"), 2);
  assert.equal(counts.byFolder.get("basketball"), 1);
  assert.equal(counts.byFolder.get("website"), 1);
  assert.equal(counts.byFolder.get("admissions"), 0);
});

test("filters by the folder-tree selection", () => {
  const ids = (selection: Parameters<typeof filterByFolderSelection>[2]) =>
    filterByFolderSelection(docs, folders, selection).map((d) => d.id);
  assert.deepEqual(ids(null), ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(ids(UNFILED), ["4", "5"]);
  assert.deepEqual(ids("fall"), ["1", "2"]);
  assert.deepEqual(ids("admissions"), []);
});

test("finds only a root Website folder, preferring the exact name", () => {
  assert.equal(findWebsiteFolder(folders)?.id, "website");
  assert.equal(
    findWebsiteFolder([{ id: "nested", name: "Website", parent_id: "sports" }]),
    null
  );
  assert.equal(findWebsiteFolder([]), null);
  assert.equal(
    findWebsiteFolder([
      { id: "lower", name: "website", parent_id: null },
      { id: "exact", name: "Website", parent_id: null },
    ])?.id,
    "exact"
  );
  assert.equal(
    findWebsiteFolder([{ id: "lower", name: " website ", parent_id: null }])?.id,
    "lower"
  );
});

test("auto-sort never offers Responses, and offers Website only to website documents", () => {
  const offered = (source: string | null) =>
    autoSortFolderCandidates(folders, source).map((f) => f.id).sort();

  for (const source of ["upload", "email", null]) {
    assert.deepEqual(offered(source), ["admissions", "athletics", "basketball", "fall", "sports"]);
  }
  assert.deepEqual(offered("website"), [
    "admissions",
    "athletics",
    "basketball",
    "fall",
    "sports",
    "web-news",
    "website",
  ]);
});
