import { test } from "node:test";
import assert from "node:assert/strict";
import { toFolderOptions, type FolderNode } from "./classify-document";

function labelOf(options: { id: string; name: string }[], id: string): string {
  const match = options.find((o) => o.id === id);
  assert.ok(match, `no option built for folder ${id}`);
  return match.name;
}

test("labels a root folder with its bare name", () => {
  const folders: FolderNode[] = [{ id: "a", name: "Athletics", parent_id: null }];

  const options = toFolderOptions(folders);

  assert.equal(labelOf(options, "a"), "Athletics");
});

test("labels a nested folder with its full path", () => {
  const folders: FolderNode[] = [
    { id: "a", name: "Athletics", parent_id: null },
    { id: "b", name: "Forms", parent_id: "a" },
    { id: "c", name: "Fall", parent_id: "b" },
  ];

  const options = toFolderOptions(folders);

  assert.equal(labelOf(options, "c"), "Athletics / Forms / Fall");
});

test("gives sibling-named folders distinct labels", () => {
  // folders is unique(name, parent_id, school_id), so the same leaf name under
  // two parents is legal — and is exactly what bare-name matching confused.
  const folders: FolderNode[] = [
    { id: "a", name: "Athletics", parent_id: null },
    { id: "b", name: "Admissions", parent_id: null },
    { id: "a-forms", name: "Forms", parent_id: "a" },
    { id: "b-forms", name: "Forms", parent_id: "b" },
  ];

  const options = toFolderOptions(folders);

  assert.equal(labelOf(options, "a-forms"), "Athletics / Forms");
  assert.equal(labelOf(options, "b-forms"), "Admissions / Forms");
  assert.notEqual(labelOf(options, "a-forms"), labelOf(options, "b-forms"));
});

test("stops at a parent that is missing from the list", () => {
  const folders: FolderNode[] = [
    { id: "b", name: "Forms", parent_id: "missing" },
  ];

  const options = toFolderOptions(folders);

  assert.equal(labelOf(options, "b"), "Forms");
});

test("terminates on a parent_id cycle", () => {
  const folders: FolderNode[] = [
    { id: "a", name: "A", parent_id: "b" },
    { id: "b", name: "B", parent_id: "a" },
  ];

  const options = toFolderOptions(folders);

  assert.equal(options.length, 2);
  assert.equal(labelOf(options, "a"), "B / A");
});

test("attaches example titles to the matching folder", () => {
  const folders: FolderNode[] = [
    { id: "a", name: "Athletics", parent_id: null },
    { id: "b", name: "Newsletters", parent_id: null },
  ];
  const examples = new Map([["a", { examples: ["Soccer Tryouts"] }]]);

  const options = toFolderOptions(folders, examples);

  assert.deepEqual(options.find((o) => o.id === "a")?.examples, [
    "Soccer Tryouts",
  ]);
  assert.equal(options.find((o) => o.id === "b")?.examples, undefined);
});
