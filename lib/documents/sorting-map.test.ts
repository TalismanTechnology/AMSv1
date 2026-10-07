import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTree,
  docTypeOf,
  groupByDivision,
  groupByFolder,
  hubBuckets,
  hubId,
  layoutTree,
  nodesWithMatches,
  normalizeQuery,
  openForMatches,
  walkTree,
  LEVEL_GAP,
  LIST_ROWS,
  NODE_HEIGHT,
  NODE_WIDTH,
  ROW_HEIGHT,
  UNSORTED_CATEGORY_ID,
  UNSORTED_FOLDER_ID,
  type Box,
  type Bucket,
  type MapDivision,
  type MapDocument,
  type MapFolder,
  type MapLayout,
  type TreeNode,
} from "./sorting-map";

let nextId = 0;
function doc(fields: Partial<MapDocument> = {}): MapDocument {
  nextId += 1;
  return {
    id: `doc-${nextId}`,
    title: `Document ${nextId}`,
    file_type: "pdf",
    status: "ready",
    category_id: null,
    folder_id: null,
    ...fields,
  };
}

function docs(count: number, fields: Partial<MapDocument> = {}): MapDocument[] {
  return Array.from({ length: count }, () => doc(fields));
}

function find<D extends MapDocument>(buckets: Bucket<D>[], id: string): Bucket<D> {
  const match = buckets.find((b) => b.id === id);
  assert.ok(match, `no bucket ${id}`);
  return match;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function assertNoOverlap(boxes: Map<string, Box>) {
  const entries = [...boxes.entries()];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      assert.ok(
        !overlaps(entries[i][1], entries[j][1]),
        `${entries[i][0]} overlaps ${entries[j][0]}`
      );
    }
  }
}

// ── Grouping ──────────────────────────────────────────

const divisions: MapDivision[] = [
  { id: "upper", name: "Upper School", sort_order: 2, color: "#10b981" },
  { id: "lower", name: "Lower School", sort_order: 0, color: "#0ea5e9" },
];
const categories = [
  { id: "u-ath", name: "Athletics", color: "#f97316", division_id: "upper", sort_order: 1 },
  { id: "u-aca", name: "Academics", color: "#3b82f6", division_id: "upper", sort_order: 0 },
  { id: "l-aca", name: "Academics", color: "#3b82f6", division_id: "lower", sort_order: 0 },
  { id: "w-pol", name: "Policies", color: "#6366f1", division_id: null, sort_order: 0 },
];

test("groups categories under the whole school, then each division", () => {
  const buckets = groupByDivision([], categories, divisions);

  assert.deepEqual(
    buckets.map((b) => [b.id, b.depth]),
    [
      ["division:whole", 0],
      ["category:w-pol", 1],
      ["division:lower", 0],
      ["category:l-aca", 1],
      ["division:upper", 0],
      ["category:u-aca", 1],
      ["category:u-ath", 1],
    ]
  );
  assert.deepEqual(find(buckets, "division:upper").children, [
    "category:u-aca",
    "category:u-ath",
  ]);
  assert.equal(find(buckets, "division:upper").color, "#10b981");
  assert.equal(find(buckets, "category:u-aca").group, "Upper School");
});

test("files each document under its category, and counts it in its division", () => {
  const sporty = doc({ category_id: "u-ath" });
  const buckets = groupByDivision(
    [sporty, doc({ category_id: "u-aca" }), doc({ category_id: "w-pol" })],
    categories,
    divisions
  );

  assert.deepEqual(find(buckets, "category:u-ath").docs, [sporty]);
  assert.equal(find(buckets, "division:upper").total, 2);
  assert.equal(find(buckets, "division:whole").total, 1);
  assert.equal(find(buckets, "division:lower").total, 0);
});

test("gives empty categories a branch of their own", () => {
  const buckets = groupByDivision([doc({ category_id: "u-ath" })], categories, divisions);

  assert.equal(find(buckets, "category:u-aca").total, 0);
  assert.ok(find(buckets, "division:upper").children.includes("category:u-aca"));
  const folderTree = buildTree("category", buckets);
  const upper = walkTree(folderTree).find((n) => n.id === "division:upper");
  assert.deepEqual(upper?.children.map((c) => c.id), ["category:u-aca", "category:u-ath"]);
});

test("collects uncategorized documents, and unknown categories, under No category", () => {
  const loose = doc();
  const stale = doc({ category_id: "deleted" });
  const buckets = groupByDivision(
    [loose, stale, doc({ category_id: "u-ath" })],
    categories,
    divisions
  );

  const unsorted = find(buckets, UNSORTED_CATEGORY_ID);
  assert.equal(unsorted.kind, "unsorted");
  assert.equal(unsorted.targetId, null);
  assert.equal(unsorted.depth, 0);
  assert.deepEqual(unsorted.docs, [loose, stale]);
});

test("leaves out the No category card when everything has a category", () => {
  const buckets = groupByDivision([doc({ category_id: "w-pol" })], categories, divisions);

  assert.ok(!buckets.some((b) => b.id === UNSORTED_CATEGORY_ID));
});

test("puts a school's undivided categories under Whole School", () => {
  const buckets = groupByDivision(
    [doc({ category_id: "forms" })],
    [{ id: "forms", name: "Forms", color: "#000" }],
    []
  );

  assert.deepEqual(buckets.map((b) => b.id), ["division:whole", "category:forms"]);
});

const folderTree: MapFolder[] = [
  { id: "sports", name: "Sports", parent_id: null },
  { id: "admissions", name: "Admissions", parent_id: null },
  { id: "forms", name: "Forms", parent_id: "sports" },
  { id: "fall", name: "Fall", parent_id: "forms" },
  { id: "aquatics", name: "Aquatics", parent_id: "sports" },
];

test("walks the folder folderTree depth first, with siblings in name order", () => {
  const buckets = groupByFolder([], folderTree);

  assert.deepEqual(
    buckets.map((b) => [b.name, b.depth]),
    [
      ["Admissions", 0],
      ["Sports", 0],
      ["Aquatics", 1],
      ["Forms", 1],
      ["Fall", 2],
    ]
  );
  assert.deepEqual(find(buckets, "folder:sports").children, [
    "folder:aquatics",
    "folder:forms",
  ]);
});

test("counts documents in subfolders toward each folder's total", () => {
  const buckets = groupByFolder(
    [
      doc({ folder_id: "sports" }),
      doc({ folder_id: "forms" }),
      doc({ folder_id: "fall" }),
      doc({ folder_id: "fall" }),
    ],
    folderTree
  );

  assert.equal(find(buckets, "folder:fall").total, 2);
  assert.equal(find(buckets, "folder:forms").total, 3);
  assert.equal(find(buckets, "folder:sports").total, 4);
  assert.equal(find(buckets, "folder:sports").docs.length, 1);
});

test("collects unfiled documents, and unknown folders, under No folder", () => {
  const loose = doc();
  const stale = doc({ folder_id: "deleted" });
  const buckets = groupByFolder([loose, stale], folderTree);

  const unsorted = find(buckets, UNSORTED_FOLDER_ID);
  assert.equal(buckets[buckets.length - 1], unsorted);
  assert.deepEqual(unsorted.docs, [loose, stale]);
  assert.equal(unsorted.depth, 0);
});

test("shows a folder whose parent is missing at the top level", () => {
  const buckets = groupByFolder([], [
    { id: "orphan", name: "Orphan", parent_id: "gone" },
  ]);

  assert.equal(find(buckets, "folder:orphan").depth, 0);
});

test("breaks a parent cycle instead of hiding or looping on it", () => {
  const buckets = groupByFolder([], [
    { id: "a", name: "A", parent_id: "b" },
    { id: "b", name: "B", parent_id: "a" },
    { id: "c", name: "C", parent_id: "a" },
    { id: "self", name: "Self", parent_id: "self" },
  ]);

  assert.deepEqual(buckets.map((b) => b.id).sort(), [
    "folder:a",
    "folder:b",
    "folder:c",
    "folder:self",
  ]);
  assert.equal(find(buckets, "folder:a").depth, 0);
  assert.equal(find(buckets, "folder:b").depth, 0);
  assert.equal(find(buckets, "folder:self").depth, 0);
  // C isn't on the loop, so it stays inside A.
  assert.equal(find(buckets, "folder:c").depth, 1);
});

test("the hub lists divisions and top-level folders, not what's inside them", () => {
  const folders = groupByFolder([doc()], folderTree);
  assert.deepEqual(
    hubBuckets(folders).map((b) => b.id),
    ["folder:admissions", "folder:sports", UNSORTED_FOLDER_ID]
  );

  const grouped = groupByDivision([doc()], categories, divisions);
  assert.deepEqual(
    hubBuckets(grouped).map((b) => b.id),
    ["division:whole", "division:lower", "division:upper", UNSORTED_CATEGORY_ID]
  );
});

// ── Tree ──────────────────────────────────────────────

function node(tree: TreeNode, id: string): TreeNode {
  const found = walkTree(tree).find((n) => n.id === id);
  assert.ok(found, `no node ${id}`);
  return found;
}

test("tells email apart from file types, and names each kind", () => {
  assert.deepEqual(docTypeOf(doc({ source: "email", file_type: "pdf" })), {
    key: "email",
    label: "Email",
  });
  assert.equal(docTypeOf(doc({ file_type: "eml" })).label, "Email");
  assert.equal(docTypeOf(doc({ file_type: "pdf" })).label, "PDF");
  assert.equal(docTypeOf(doc({ file_type: "docx" })).label, "Word");
  assert.equal(docTypeOf(doc({ file_type: "odt" })).label, "ODT");
});

test("opens from all documents, to groups, to categories, to kinds, to documents", () => {
  const memo = doc({ category_id: "u-ath", file_type: "pdf" });
  const mail = doc({ category_id: "u-ath", source: "email" });
  const tree = buildTree(
    "category",
    groupByDivision([memo, mail, doc({ category_id: "u-ath", file_type: "pdf" })], categories, divisions)
  );

  assert.equal(tree.id, hubId("category"));
  assert.equal(tree.count, 3);
  assert.deepEqual(
    tree.children.map((c) => c.id),
    ["division:whole", "division:lower", "division:upper"]
  );
  const athletics = node(tree, "category:u-ath");
  assert.deepEqual(athletics.children.map((c) => c.name), ["Email", "PDF"]);
  const pdfs = athletics.children[1];
  assert.equal(pdfs.kind, "type");
  assert.equal(pdfs.count, 2);
  assert.equal(pdfs.targetId, "u-ath");
  assert.equal(pdfs.children[0].kind, "list");
  assert.equal(pdfs.children[0].docs.length, 2);
  assert.ok(pdfs.children[0].docs.includes(memo));
  assert.deepEqual(athletics.children[0].docs, [mail]);
  // An empty category opens into nothing.
  assert.deepEqual(node(tree, "category:u-aca").children, []);
});

test("only categories and what's in them take a dropped document", () => {
  const tree = buildTree("category", groupByDivision([doc()], categories, divisions));

  assert.equal(tree.droppable, false);
  assert.equal(node(tree, "division:upper").droppable, false);
  assert.equal(node(tree, "category:u-ath").droppable, true);
  const unsorted = node(tree, UNSORTED_CATEGORY_ID);
  assert.equal(unsorted.droppable, true);
  assert.equal(unsorted.targetId, null);
  assert.equal(unsorted.children[0].unsorted, true);
});

test("a folder opens into its subfolders, then the kinds of document in it", () => {
  const tree = buildTree("folder", groupByFolder(docs(2, { folder_id: "sports" }), folderTree));

  assert.deepEqual(
    node(tree, "folder:sports").children.map((c) => c.name),
    ["Aquatics", "Forms", "PDF"]
  );
});

// ── Search ────────────────────────────────────────────

test("opens every box on the way down to a match", () => {
  const tree = buildTree(
    "category",
    groupByDivision([doc({ category_id: "u-ath", title: "Fall Physical" }), doc({ category_id: "l-aca" })], categories, divisions)
  );

  const open = openForMatches(tree, normalizeQuery("  PHYSICAL "));

  assert.deepEqual([...open].sort(), [
    "category:u-ath",
    "category:u-ath/type:pdf",
    "division:upper",
    hubId("category"),
  ].sort());
  assert.ok(nodesWithMatches(tree, "physical").has("category:u-ath/type:pdf/list"));
  assert.ok(!nodesWithMatches(tree, "physical").has("division:lower"));
});

test("matches nothing when the search is blank", () => {
  const tree = buildTree("category", groupByDivision([doc()], categories, divisions));

  assert.equal(openForMatches(tree, normalizeQuery("   ")).size, 0);
  assert.equal(nodesWithMatches(tree, "").size, 0);
});

// ── Layout ────────────────────────────────────────────

/** Four groups of five categories, unevenly filled with PDFs and email. */
function school() {
  const groups = [
    [3, 0, 12, 1, 0],
    [0, 0, 0, 0, 0],
    [7, 2, 0, 9, 4],
    [1, 1, 1, 1, 1],
  ];
  const groupDivisions: MapDivision[] = groups.map((_, g) => ({
    id: `d${g}`,
    name: `Division ${g}`,
    sort_order: g,
    color: "#000",
  }));
  const groupCategories = groups.flatMap((sizes, g) =>
    sizes.map((_, c) => ({
      id: `d${g}c${c}`,
      name: `Category ${c}`,
      color: "#000",
      division_id: `d${g}`,
      sort_order: c,
    }))
  );
  const library = groups.flatMap((sizes, g) =>
    sizes.flatMap((count, c) =>
      Array.from({ length: count }, (_, k) =>
        doc({ category_id: `d${g}c${c}`, source: k % 2 ? "email" : "upload" })
      )
    )
  );
  return buildTree("category", groupByDivision(library, groupCategories, groupDivisions));
}

function box(layout: MapLayout, id: string): Box {
  const found = layout.boxes.get(id);
  assert.ok(found, `no box for ${id}`);
  return found;
}

/** Every box in the tree that opens into something. */
function everyOpenable(tree: TreeNode): Set<string> {
  return new Set(walkTree(tree).filter((n) => n.children.length).map((n) => n.id));
}

test("shows only the root until it is opened", () => {
  const tree = school();
  const layout = layoutTree(tree, new Set());

  assert.deepEqual([...layout.boxes.keys()], [tree.id]);
  assert.equal(layout.links.length, 0);
});

test("opening the root shows the groups in a row beneath it, and no deeper", () => {
  const tree = school();
  const layout = layoutTree(tree, new Set([tree.id]));

  assert.deepEqual(
    layout.nodes.map((n) => n.id),
    [tree.id, "division:d0", "division:d1", "division:d2", "division:d3"]
  );
  const ys = new Set([0, 1, 2, 3].map((g) => box(layout, `division:d${g}`).y));
  assert.deepEqual([...ys], [NODE_HEIGHT + LEVEL_GAP]);
  // The root sits centred over its row.
  const first = box(layout, "division:d0");
  const last = box(layout, "division:d3");
  assert.equal(
    box(layout, tree.id).x + NODE_WIDTH / 2,
    (first.x + last.x + NODE_WIDTH) / 2
  );
});

test("opening a group shows its five categories under it", () => {
  const tree = school();
  const layout = layoutTree(tree, new Set([tree.id, "division:d2"]));

  const categoriesShown = layout.nodes.filter((n) => n.kind === "category");
  assert.deepEqual(
    categoriesShown.map((n) => n.id),
    [0, 1, 2, 3, 4].map((c) => `category:d2c${c}`)
  );
  assert.deepEqual(
    layout.links.filter((l) => l.source === "division:d2").map((l) => l.target),
    categoriesShown.map((n) => n.id)
  );
});

test("closing a box hides everything beneath it, even what was left open", () => {
  const tree = school();
  const open = new Set([tree.id, "division:d0", "category:d0c2", "category:d0c2/type:pdf"]);
  assert.ok(layoutTree(tree, open).boxes.has("category:d0c2/type:pdf/list"));

  open.delete("division:d0");
  const layout = layoutTree(tree, open);
  assert.ok(!layout.boxes.has("category:d0c2"));
  assert.ok(!layout.boxes.has("category:d0c2/type:pdf/list"));
});

test("a document list scrolls past its first rows instead of growing", () => {
  const tree = school();
  const layout = layoutTree(tree, everyOpenable(tree));

  const longest = box(layout, "category:d0c2/type:pdf/list");
  assert.equal(longest.height, 2 + Math.min(6, LIST_ROWS) * ROW_HEIGHT);
});

test("never overlaps boxes, with everything open", () => {
  const tree = school();
  assertNoOverlap(layoutTree(tree, everyOpenable(tree)).boxes);
  assertNoOverlap(layoutTree(tree, new Set([tree.id, "division:d0", "division:d2"])).boxes);
});

test("starts each level below the tallest box above it", () => {
  const tree = school();
  const layout = layoutTree(tree, everyOpenable(tree));

  for (const link of layout.links) {
    const source = box(layout, link.source);
    const target = box(layout, link.target);
    assert.ok(target.y >= source.y + source.height + LEVEL_GAP);
  }
});

test("lays out an empty library as a lone root", () => {
  for (const view of ["category", "folder"] as const) {
    const tree = buildTree(view, []);
    const layout = layoutTree(tree, new Set([tree.id]));

    assert.deepEqual([...layout.boxes.keys()], [hubId(view)]);
    assert.equal(layout.links.length, 0);
  }
});
