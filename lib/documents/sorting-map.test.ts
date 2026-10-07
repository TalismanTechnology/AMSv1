import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketsWithMatches,
  cardHeight,
  cardRowCount,
  groupByCategory,
  groupByFolder,
  hubBuckets,
  hubId,
  layoutMap,
  normalizeQuery,
  packingBasis,
  roundedPath,
  routeLink,
  rowHandleId,
  CARD_WIDTH,
  HEADER_HEIGHT,
  PREVIEW_ROWS,
  ROW_HEIGHT,
  UNSORTED_CATEGORY_ID,
  UNSORTED_FOLDER_ID,
  type Box,
  type Bucket,
  type MapDocument,
  type MapFolder,
  type MapLayout,
  type MapLink,
  type MapView,
  type Point,
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
    a.x < b.x + CARD_WIDTH &&
    b.x < a.x + CARD_WIDTH &&
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

test("files each document under its category, in category order", () => {
  const forms = doc({ category_id: "forms" });
  const menu = doc({ category_id: "dining" });
  const buckets = groupByCategory(
    [forms, menu],
    [
      { id: "dining", name: "Dining", color: "#f97316" },
      { id: "forms", name: "Forms", color: "#6366f1" },
    ]
  );

  assert.deepEqual(
    buckets.map((b) => [b.name, b.docs.map((d) => d.id)]),
    [
      ["Dining", [menu.id]],
      ["Forms", [forms.id]],
    ]
  );
  assert.equal(find(buckets, "category:forms").color, "#6366f1");
});

test("collects uncategorized documents, and unknown categories, under No category", () => {
  const loose = doc();
  const stale = doc({ category_id: "deleted" });
  const buckets = groupByCategory(
    [loose, stale, doc({ category_id: "forms" })],
    [{ id: "forms", name: "Forms", color: "#6366f1" }]
  );

  const unsorted = find(buckets, UNSORTED_CATEGORY_ID);
  assert.equal(unsorted.kind, "unsorted");
  assert.equal(unsorted.targetId, null);
  assert.deepEqual(unsorted.docs, [loose, stale]);
});

test("leaves out the No category card when everything has a category", () => {
  const buckets = groupByCategory(
    [doc({ category_id: "forms" })],
    [{ id: "forms", name: "Forms", color: "#6366f1" }]
  );

  assert.deepEqual(buckets.map((b) => b.id), ["category:forms"]);
});

test("keeps empty categories so they still show on the map", () => {
  const buckets = groupByCategory([], [
    { id: "forms", name: "Forms", color: "#6366f1" },
  ]);

  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].total, 0);
});

const tree: MapFolder[] = [
  { id: "sports", name: "Sports", parent_id: null },
  { id: "admissions", name: "Admissions", parent_id: null },
  { id: "forms", name: "Forms", parent_id: "sports" },
  { id: "fall", name: "Fall", parent_id: "forms" },
  { id: "aquatics", name: "Aquatics", parent_id: "sports" },
];

test("walks the folder tree depth first, with siblings in name order", () => {
  const buckets = groupByFolder([], tree);

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
    tree
  );

  assert.equal(find(buckets, "folder:fall").total, 2);
  assert.equal(find(buckets, "folder:forms").total, 3);
  assert.equal(find(buckets, "folder:sports").total, 4);
  assert.equal(find(buckets, "folder:sports").docs.length, 1);
});

test("collects unfiled documents, and unknown folders, under No folder", () => {
  const loose = doc();
  const stale = doc({ folder_id: "deleted" });
  const buckets = groupByFolder([loose, stale], tree);

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

test("the hub lists every category, but only top-level folders", () => {
  const folders = groupByFolder([doc()], tree);

  assert.deepEqual(
    hubBuckets("folder", folders).map((b) => b.id),
    ["folder:admissions", "folder:sports", UNSORTED_FOLDER_ID]
  );

  const categories = groupByCategory([doc()], [
    { id: "forms", name: "Forms", color: "#6366f1" },
  ]);
  assert.equal(hubBuckets("category", categories), categories);
});

// ── Search ────────────────────────────────────────────

test("marks folders above a match so the path to it lights up", () => {
  const buckets = groupByFolder(
    [doc({ folder_id: "fall", title: "Fall Sports Physical" })],
    tree
  );

  const hits = bucketsWithMatches(buckets, normalizeQuery("  PHYSICAL "));

  assert.deepEqual([...hits].sort(), [
    "folder:fall",
    "folder:forms",
    "folder:sports",
  ]);
});

test("matches nothing when the search is blank", () => {
  const buckets = groupByCategory([doc()], []);

  assert.equal(bucketsWithMatches(buckets, normalizeQuery("   ")).size, 0);
});

// ── Card sizes ────────────────────────────────────────

test("folds documents past the preview behind a Show all row", () => {
  const [bucket] = groupByCategory(docs(PREVIEW_ROWS + 5, { category_id: "c" }), [
    { id: "c", name: "C", color: "#000" },
  ]);

  assert.equal(cardRowCount(bucket, false), PREVIEW_ROWS + 1);
  assert.equal(cardRowCount(bucket, true), PREVIEW_ROWS + 5 + 1);
  assert.ok(cardHeight(bucket, true) > cardHeight(bucket, false));
});

test("gives an empty card one placeholder row", () => {
  const [bucket] = groupByCategory([], [{ id: "c", name: "C", color: "#000" }]);

  assert.equal(cardRowCount(bucket, false), 1);
});

test("lists subfolders as rows ahead of documents", () => {
  const buckets = groupByFolder(docs(2, { folder_id: "sports" }), tree);

  // Aquatics + Forms + two documents.
  assert.equal(cardRowCount(find(buckets, "folder:sports"), false), 4);
});

// ── Layout ────────────────────────────────────────────

function categoryBuckets(sizes: number[]) {
  const categories = sizes.map((_, i) => ({
    id: `c${i}`,
    name: `Category ${i}`,
    color: "#000",
  }));
  const all = sizes.flatMap((size, i) => docs(size, { category_id: `c${i}` }));
  return groupByCategory(all, categories);
}

test("links the hub to every category card from that category's row", () => {
  const buckets = categoryBuckets([3, 0, 12]);

  const layout = layoutMap("category", buckets, new Set());

  assert.deepEqual(
    layout.links.map((l) => [l.source, l.sourceHandle, l.target]),
    buckets.map((b) => [hubId("category"), rowHandleId(b.id), b.id])
  );
  for (const bucket of buckets) assert.ok(layout.boxes.has(bucket.id));
});

test("never overlaps cards, however many categories there are", () => {
  for (const count of [1, 2, 5, 9, 17]) {
    const sizes = Array.from({ length: count }, (_, i) => (i * 7) % 15);

    const layout = layoutMap("category", categoryBuckets(sizes), new Set());

    assertNoOverlap(layout.boxes);
  }
});

test("spreads many categories over several columns", () => {
  const buckets = categoryBuckets(Array.from({ length: 12 }, () => 6));

  const layout = layoutMap("category", buckets, new Set());

  const columns = new Set(buckets.map((b) => layout.boxes.get(b.id)!.x));
  assert.ok(columns.size > 1, "expected more than one column");
  for (const x of columns) assert.ok(x > CARD_WIDTH, "cards sit right of the hub");
});

test("puts the first card's header level with the hub's first row", () => {
  const buckets = categoryBuckets([2]);

  const layout = layoutMap("category", buckets, new Set());

  const hub = layout.boxes.get(hubId("category"))!;
  const card = layout.boxes.get(buckets[0].id)!;
  const hubRowCentre = hub.y + 1 + HEADER_HEIGHT + ROW_HEIGHT / 2;
  const cardHeaderCentre = card.y + 1 + HEADER_HEIGHT / 2;
  assert.equal(cardHeaderCentre, hubRowCentre);
});

test("an expanded card grows without running into its neighbours", () => {
  const buckets = categoryBuckets([20, 20, 20, 20]);
  const expanded = new Set([buckets[0].id, buckets[2].id]);

  const folded = layoutMap("category", buckets, new Set());
  const opened = layoutMap("category", buckets, expanded);

  assert.ok(
    opened.boxes.get(buckets[0].id)!.height >
      folded.boxes.get(buckets[0].id)!.height
  );
  assertNoOverlap(opened.boxes);
});

test("expanding a card moves only the cards below it in its column", () => {
  const buckets = categoryBuckets([20, 3, 5, 20, 2, 7, 4, 9]);
  const before = layoutMap("category", buckets, new Set());

  const after = layoutMap("category", buckets, new Set([buckets[0].id]));

  const opened = before.boxes.get(buckets[0].id)!;
  for (const bucket of buckets) {
    const was = before.boxes.get(bucket.id)!;
    const now = after.boxes.get(bucket.id)!;
    assert.equal(now.x, was.x, `${bucket.id} stayed in its column`);
    if (was.x !== opened.x || was.y <= opened.y) {
      assert.equal(now.y, was.y, `${bucket.id} didn't move`);
    } else {
      assert.ok(now.y > was.y, `${bucket.id} was pushed down`);
    }
  }
});

test("moving a document between cards keeps every card in its column", () => {
  const categories = ["a", "b", "c", "d", "e", "f"].map((id) => ({
    id,
    name: id.toUpperCase(),
    color: "#000",
  }));
  const library = categories.flatMap((c, i) =>
    docs(i + 1, { category_id: c.id })
  );
  const before = groupByCategory(library, categories);
  const basis = packingBasis(before);

  // Move one document from F to A, as a drop on the map does.
  const moved = library.map((d) =>
    d === library[library.length - 1] ? { ...d, category_id: "a" } : d
  );
  const after = groupByCategory(moved, categories);

  const x = (layout: ReturnType<typeof layoutMap>, id: string) =>
    layout.boxes.get(id)!.x;
  const was = layoutMap("category", before, new Set(), basis);
  const now = layoutMap("category", after, new Set(), basis);
  for (const c of categories) {
    assert.equal(x(now, `category:${c.id}`), x(was, `category:${c.id}`));
  }
  assertNoOverlap(now.boxes);
});

test("fits in a category added since the map opened without moving others", () => {
  const before = categoryBuckets([4, 6, 2, 8, 3]);
  const basis = packingBasis(before);
  const after = groupByCategory(
    before.flatMap((b) => b.docs),
    [
      ...before.map((b) => ({ id: b.targetId!, name: b.name, color: "#000" })),
      { id: "new", name: "Brand New", color: "#000" },
    ]
  );

  const was = layoutMap("category", before, new Set(), basis);
  const now = layoutMap("category", after, new Set(), basis);

  for (const bucket of before) {
    assert.deepEqual(now.boxes.get(bucket.id), was.boxes.get(bucket.id));
  }
  assert.ok(now.boxes.has("category:new"));
  assertNoOverlap(now.boxes);
});

test("draws the folder tree left to right, one column per level", () => {
  const buckets = groupByFolder(docs(3, { folder_id: "forms" }), tree);

  const layout = layoutMap("folder", buckets, new Set());

  const x = (id: string) => layout.boxes.get(id)!.x;
  assert.ok(x("folder:sports") > x(hubId("folder")));
  assert.ok(x("folder:forms") > x("folder:sports"));
  assert.ok(x("folder:fall") > x("folder:forms"));
  assert.equal(x("folder:aquatics"), x("folder:forms"));
  assertNoOverlap(layout.boxes);
});

test("links each folder to its subfolders from their rows", () => {
  const buckets = groupByFolder([], tree);

  const layout = layoutMap("folder", buckets, new Set());

  const fromSports = layout.links
    .filter((l) => l.source === "folder:sports")
    .map((l) => [l.sourceHandle, l.target]);
  assert.deepEqual(fromSports, [
    [rowHandleId("folder:aquatics"), "folder:aquatics"],
    [rowHandleId("folder:forms"), "folder:forms"],
  ]);
  // Hub → each top-level folder, plus one link per subfolder.
  assert.equal(layout.links.length, 2 + 3);
});

test("keeps each top-level folder's subtree together", () => {
  const folders: MapFolder[] = [
    { id: "a", name: "A", parent_id: null },
    { id: "a1", name: "A1", parent_id: "a" },
    { id: "a2", name: "A2", parent_id: "a" },
    { id: "b", name: "B", parent_id: null },
  ];
  const buckets = groupByFolder(docs(9, { folder_id: "a2" }), folders);

  const layout = layoutMap("folder", buckets, new Set());

  const underA = ["folder:a", "folder:a1", "folder:a2"].map(
    (id) => layout.boxes.get(id)!
  );
  const region: Box = {
    x: Math.min(...underA.map((box) => box.x)),
    y: Math.min(...underA.map((box) => box.y)),
    height:
      Math.max(...underA.map((box) => box.y + box.height)) -
      Math.min(...underA.map((box) => box.y)),
  };
  const regionWidth =
    Math.max(...underA.map((box) => box.x)) + CARD_WIDTH - region.x;
  const b = layout.boxes.get("folder:b")!;
  const insideRegion =
    b.x < region.x + regionWidth &&
    region.x < b.x + CARD_WIDTH &&
    b.y < region.y + region.height &&
    region.y < b.y + b.height;
  assert.ok(!insideRegion, "B sits outside the block of A's subtree");
  assertNoOverlap(layout.boxes);
});

test("spreads many top-level folders over several columns", () => {
  const folders: MapFolder[] = Array.from({ length: 10 }, (_, i) => ({
    id: `f${i}`,
    name: `Folder ${String(i).padStart(2, "0")}`,
    parent_id: null,
  }));
  const all = folders.flatMap((f) => docs(6, { folder_id: f.id }));
  const buckets = groupByFolder(all, folders);

  const layout = layoutMap("folder", buckets, new Set());

  const columns = new Set(folders.map((f) => layout.boxes.get(`folder:${f.id}`)!.x));
  assert.ok(columns.size > 1, "expected more than one column");
  assertNoOverlap(layout.boxes);
});

// ── Links ─────────────────────────────────────────────

/** Where React Flow will find a link's two handles, given the card sizes. */
function handlesOf(
  view: MapView,
  buckets: Bucket[],
  layout: MapLayout,
  link: MapLink
) {
  const sourceBox = layout.boxes.get(link.source)!;
  const targetBox = layout.boxes.get(link.target)!;
  const rows =
    link.source === hubId(view)
      ? hubBuckets(view, buckets).map((b) => b.id)
      : find(buckets, link.source).children;
  const row = rows.indexOf(link.target);
  assert.ok(row >= 0, `${link.target} has no row in ${link.source}`);
  return {
    source: {
      x: sourceBox.x + CARD_WIDTH,
      y: sourceBox.y + 1 + HEADER_HEIGHT + row * ROW_HEIGHT + ROW_HEIGHT / 2,
    },
    target: { x: targetBox.x, y: targetBox.y + 1 + HEADER_HEIGHT / 2 },
  };
}

/** Whether an axis-aligned segment passes through a card's interior. */
function crosses(a: Point, b: Point, box: Box): boolean {
  return (
    Math.min(a.x, b.x) < box.x + CARD_WIDTH &&
    Math.max(a.x, b.x) > box.x &&
    Math.min(a.y, b.y) < box.y + box.height &&
    Math.max(a.y, b.y) > box.y
  );
}

function assertNoLinkBehindACard(view: MapView, buckets: Bucket[]) {
  const layout = layoutMap(view, buckets, new Set());
  for (const link of layout.links) {
    const { source, target } = handlesOf(view, buckets, layout, link);
    const corners = routeLink(source, target, link);
    assert.ok(corners, `${link.id} has a route`);
    for (let i = 1; i < corners.length; i++) {
      for (const [id, box] of layout.boxes) {
        assert.ok(
          !crosses(corners[i - 1], corners[i], box),
          `${link.id} runs behind ${id}`
        );
      }
    }
  }
}

test("no link to a category runs behind another card", () => {
  for (const count of [3, 8, 14]) {
    const sizes = Array.from({ length: count }, (_, i) => (i * 5) % 11);
    assertNoLinkBehindACard("category", categoryBuckets(sizes));
  }
});

test("no link in the folder tree runs behind another card", () => {
  const folders: MapFolder[] = [...tree];
  for (let i = 0; i < 7; i++) {
    folders.push({ id: `r${i}`, name: `Root ${i}`, parent_id: null });
    folders.push({ id: `r${i}-a`, name: "A", parent_id: `r${i}` });
    folders.push({ id: `r${i}-b`, name: "B", parent_id: `r${i}` });
  }
  const all = [
    ...docs(12, { folder_id: "forms" }),
    ...docs(3, { folder_id: "r2-b" }),
    ...docs(4),
  ];

  assertNoLinkBehindACard("folder", groupByFolder(all, folders));
});

test("sends a link across other cards through the lane above them", () => {
  const corners = routeLink({ x: 100, y: 300 }, { x: 700, y: 80 }, {
    gutter: 100,
    overhead: { y: 20, approach: 40 },
  });

  assert.deepEqual(corners, [
    { x: 100, y: 300 },
    { x: 150, y: 300 },
    { x: 150, y: 20 },
    { x: 680, y: 20 },
    { x: 680, y: 80 },
    { x: 700, y: 80 },
  ]);
});

test("gives up routing when the target is dragged back over the gutter", () => {
  assert.equal(
    routeLink({ x: 100, y: 0 }, { x: 120, y: 50 }, { gutter: 100 }),
    null
  );
});

test("rounds every corner of a path and skips straight runs", () => {
  assert.equal(
    roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], 8),
    "M 0,0 L 20,0"
  );
  assert.equal(
    roundedPath([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }], 8),
    "M 0,0 L 32,0 Q 40,0 40,8 L 40,40"
  );
  // A corner closer than the radius gets a tighter curve, not an overshoot.
  assert.equal(
    roundedPath([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 40 }], 8),
    "M 0,0 L 3,0 Q 6,0 6,3 L 6,40"
  );
});

test("lays out an empty library as a lone hub", () => {
  for (const view of ["category", "folder"] as const) {
    const layout = layoutMap(view, [], new Set());

    assert.deepEqual([...layout.boxes.keys()], [hubId(view)]);
    assert.equal(layout.links.length, 0);
  }
});
