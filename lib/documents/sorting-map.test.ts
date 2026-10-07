import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketsWithMatches,
  cardHeight,
  cardRowCount,
  groupByDivision,
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
  type MapDivision,
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

test("groups categories under their division, then the whole school", () => {
  const buckets = groupByDivision([], categories, divisions);

  assert.deepEqual(
    buckets.map((b) => [b.id, b.depth]),
    [
      ["division:lower", 0],
      ["category:l-aca", 1],
      ["division:upper", 0],
      ["category:u-aca", 1],
      ["category:u-ath", 1],
      ["division:whole", 0],
      ["category:w-pol", 1],
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

test("gives empty categories a row in their division but no card", () => {
  const buckets = groupByDivision([doc({ category_id: "u-ath" })], categories, divisions);

  assert.equal(find(buckets, "category:u-ath").rowOnly, false);
  assert.equal(find(buckets, "category:u-aca").rowOnly, true);
  // Still a row, so it can take a dropped document.
  assert.ok(find(buckets, "division:upper").children.includes("category:u-aca"));
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

test("the hub lists divisions and top-level folders, not what's inside them", () => {
  const folders = groupByFolder([doc()], tree);
  assert.deepEqual(
    hubBuckets(folders).map((b) => b.id),
    ["folder:admissions", "folder:sports", UNSORTED_FOLDER_ID]
  );

  const grouped = groupByDivision([doc()], categories, divisions);
  assert.deepEqual(
    hubBuckets(grouped).map((b) => b.id),
    ["division:lower", "division:upper", "division:whole", UNSORTED_CATEGORY_ID]
  );
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
  const buckets = groupByDivision([doc()], categories, divisions);

  assert.equal(bucketsWithMatches(buckets, normalizeQuery("   ")).size, 0);
});

// ── Card sizes ────────────────────────────────────────

test("folds documents past the preview behind a Show all row", () => {
  const bucket = find(
    groupByDivision(docs(PREVIEW_ROWS + 5, { category_id: "w-pol" }), categories, divisions),
    "category:w-pol"
  );

  assert.equal(cardRowCount(bucket, false), PREVIEW_ROWS + 1);
  assert.equal(cardRowCount(bucket, true), PREVIEW_ROWS + 5 + 1);
  assert.ok(cardHeight(bucket, true) > cardHeight(bucket, false));
});

test("gives an empty card one placeholder row", () => {
  const [bucket] = groupByFolder([], [{ id: "f", name: "F", parent_id: null }]);

  assert.equal(cardRowCount(bucket, false), 1);
});

test("lists a division's categories as rows, empty ones included", () => {
  const buckets = groupByDivision([doc({ category_id: "u-ath" })], categories, divisions);

  assert.equal(cardRowCount(find(buckets, "division:upper"), false), 2);
});

test("lists subfolders as rows ahead of documents", () => {
  const buckets = groupByFolder(docs(2, { folder_id: "sports" }), tree);

  // Aquatics + Forms + two documents.
  assert.equal(cardRowCount(find(buckets, "folder:sports"), false), 4);
});

// ── Layout ────────────────────────────────────────────

/**
 * A library of divisions, each a list of categories given as how many
 * documents each holds.
 */
function divisionLibrary(groups: number[][]) {
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
    sizes.flatMap((count, c) => docs(count, { category_id: `d${g}c${c}` }))
  );
  return {
    divisions: groupDivisions,
    categories: groupCategories,
    library,
    buckets: groupByDivision(library, groupCategories, groupDivisions),
  };
}

test("links the hub to each division, and each division to its filled categories", () => {
  const { buckets } = divisionLibrary([[3, 0, 12], [1]]);

  const layout = layoutMap("category", buckets, new Set());

  assert.deepEqual(
    layout.links.map((l) => [l.source, l.sourceHandle, l.target]),
    [
      [hubId("category"), rowHandleId("division:d0"), "division:d0"],
      ["division:d0", rowHandleId("category:d0c0"), "category:d0c0"],
      ["division:d0", rowHandleId("category:d0c2"), "category:d0c2"],
      [hubId("category"), rowHandleId("division:d1"), "division:d1"],
      ["division:d1", rowHandleId("category:d1c0"), "category:d1c0"],
    ]
  );
  // The empty category is only a row: no card, no link.
  assert.ok(!layout.boxes.has("category:d0c1"));
});

test("never overlaps cards, however the divisions fill up", () => {
  for (const groups of [[[1]], [[3, 0, 9], [2, 2]], [[7, 1, 0, 4, 2, 12, 3], [0, 0, 1], [5, 5, 5, 5], [2]]]) {
    const layout = layoutMap("category", divisionLibrary(groups).buckets, new Set());

    assertNoOverlap(layout.boxes);
  }
});

test("spreads divisions over several columns", () => {
  const { buckets } = divisionLibrary([[6, 6, 6], [6, 6, 6], [6, 6, 6], [6, 6, 6]]);

  const layout = layoutMap("category", buckets, new Set());

  const columns = new Set(
    buckets.filter((b) => b.kind === "division").map((b) => layout.boxes.get(b.id)!.x)
  );
  assert.ok(columns.size > 1, "expected more than one column");
});

test("puts the first card's header level with the hub's first row", () => {
  const { buckets } = divisionLibrary([[2]]);

  const layout = layoutMap("category", buckets, new Set());

  const hub = layout.boxes.get(hubId("category"))!;
  const card = layout.boxes.get("division:d0")!;
  const hubRowCentre = hub.y + 1 + HEADER_HEIGHT + ROW_HEIGHT / 2;
  const cardHeaderCentre = card.y + 1 + HEADER_HEIGHT / 2;
  assert.equal(cardHeaderCentre, hubRowCentre);
});

test("expanding a card changes no card's column and moves nothing above it", () => {
  const { buckets } = divisionLibrary([[20, 3, 5], [20, 2], [7, 4, 9], [1]]);
  const target = "category:d0c0";
  const before = layoutMap("category", buckets, new Set());

  const after = layoutMap("category", buckets, new Set([target]));

  assert.ok(after.boxes.get(target)!.height > before.boxes.get(target)!.height);
  const openedTop = before.boxes.get(target)!.y;
  for (const [id, was] of before.boxes) {
    const now = after.boxes.get(id)!;
    assert.equal(now.x, was.x, `${id} stayed in its column`);
    if (now.y !== was.y) assert.ok(was.y > openedTop, `${id} was above, yet moved`);
  }
  assertNoOverlap(after.boxes);
});

test("moving a document between categories keeps every division in its column", () => {
  const { buckets, library, categories: cats, divisions: divs } = divisionLibrary([
    [1, 2, 3],
    [4, 5],
    [6],
  ]);
  const basis = packingBasis(buckets);

  // Move a document from division 2 into division 0, as a drop on the map does.
  const moved = library.map((d) =>
    d === library[library.length - 1] ? { ...d, category_id: "d0c0" } : d
  );
  const after = groupByDivision(moved, cats, divs);

  const was = layoutMap("category", buckets, new Set(), basis);
  const now = layoutMap("category", after, new Set(), basis);
  for (const division of ["division:d0", "division:d1", "division:d2"]) {
    assert.equal(now.boxes.get(division)!.x, was.boxes.get(division)!.x);
  }
  assertNoOverlap(now.boxes);
});

test("fits in a division added since the map opened without moving the others", () => {
  const before = divisionLibrary([[4, 6], [2, 8], [3]]);
  const basis = packingBasis(before.buckets);
  const after = divisionLibrary([[4, 6], [2, 8], [3], [5]]);

  const was = layoutMap("category", before.buckets, new Set(), basis);
  const now = layoutMap("category", after.buckets, new Set(), basis);

  for (const id of was.boxes.keys()) {
    if (id === hubId("category")) continue;
    assert.deepEqual(now.boxes.get(id), was.boxes.get(id), id);
  }
  assert.ok(now.boxes.has("division:d3"));
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
      ? hubBuckets(buckets).map((b) => b.id)
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

test("no link in the division view runs behind another card", () => {
  for (const groups of [
    [[3, 1, 4]],
    [[2, 0, 7, 1, 1, 0, 3], [1, 1, 1, 1, 1, 1, 1], [0, 9, 0, 2, 4, 1, 1], [5, 0, 0, 0, 0, 0, 2]],
    [[12, 12], [1], [6, 0, 6], [2, 2, 2, 2]],
  ]) {
    assertNoLinkBehindACard("category", divisionLibrary(groups).buckets);
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
