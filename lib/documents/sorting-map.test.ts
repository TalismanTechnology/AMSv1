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
  roundedPath,
  routeLink,
  CARD_WIDTH,
  LEVEL_GAP,
  PREVIEW_ROWS,
  UNSORTED_CATEGORY_ID,
  UNSORTED_FOLDER_ID,
  type Box,
  type Bucket,
  type MapDivision,
  type MapDocument,
  type MapFolder,
  type MapLayout,
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
  const layout = layoutMap("category", buckets, new Set());
  assert.ok(layout.boxes.has("category:u-aca"));
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
    ["division:whole", "division:lower", "division:upper", UNSORTED_CATEGORY_ID]
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

test("draws a division as a header alone, its categories as branches", () => {
  const buckets = groupByDivision([doc({ category_id: "u-ath" })], categories, divisions);

  assert.equal(cardRowCount(find(buckets, "division:upper"), false), 0);
});

test("lists a folder's documents, its subfolders branching below", () => {
  const buckets = groupByFolder(docs(2, { folder_id: "sports" }), tree);

  assert.equal(cardRowCount(find(buckets, "folder:sports"), false), 2);
  // Only subfolders: no placeholder row either.
  assert.equal(cardRowCount(find(buckets, "folder:forms"), false), 0);
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

function box(layout: MapLayout, id: string): Box {
  const found = layout.boxes.get(id);
  assert.ok(found, `no box for ${id}`);
  return found;
}

/** Four groups of five categories, unevenly filled: twenty branches. */
const school = () =>
  divisionLibrary([
    [3, 0, 12, 1, 0],
    [0, 0, 0, 0, 0],
    [7, 2, 0, 9, 4],
    [1, 1, 1, 1, 1],
  ]);

test("grows down from the hub: divisions below it, every category below those", () => {
  const { buckets } = school();
  const layout = layoutMap("category", buckets, new Set());

  const hub = box(layout, hubId("category"));
  const divisionYs = new Set(
    [0, 1, 2, 3].map((g) => box(layout, `division:d${g}`).y)
  );
  const categoryBoxes = buckets
    .filter((b) => b.kind === "category")
    .map((b) => box(layout, b.id));

  assert.equal(categoryBoxes.length, 20);
  assert.equal(divisionYs.size, 1);
  const [divisionY] = divisionYs;
  assert.ok(divisionY >= hub.y + hub.height + LEVEL_GAP);
  assert.equal(new Set(categoryBoxes.map((b) => b.y)).size, 1);
  assert.ok(categoryBoxes[0].y > divisionY);
});

test("links the hub to each division and each division to all five categories", () => {
  const { buckets } = school();
  const layout = layoutMap("category", buckets, new Set());

  const hub = hubId("category");
  assert.deepEqual(
    layout.links.filter((l) => l.source === hub).map((l) => l.target),
    ["division:d0", "division:d1", "division:d2", "division:d3"]
  );
  for (let g = 0; g < 4; g++) {
    assert.deepEqual(
      layout.links.filter((l) => l.source === `division:d${g}`).map((l) => l.target),
      [0, 1, 2, 3, 4].map((c) => `category:d${g}c${c}`)
    );
  }
});

test("keeps each division's categories together, in order, under it", () => {
  const { buckets } = school();
  const layout = layoutMap("category", buckets, new Set());

  let lastRight = -Infinity;
  for (let g = 0; g < 4; g++) {
    const xs = [0, 1, 2, 3, 4].map((c) => box(layout, `category:d${g}c${c}`).x);
    assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
    assert.ok(xs[0] > lastRight, `division ${g} overlaps the one before`);
    lastRight = xs[4] + CARD_WIDTH;

    // The division sits centred over its categories.
    const division = box(layout, `division:d${g}`);
    assert.equal(division.x + CARD_WIDTH / 2, (xs[0] + xs[4] + CARD_WIDTH) / 2);
  }
});

test("never overlaps cards, however the categories fill up", () => {
  for (const groups of [[[0]], [[40, 0, 2], [1]], [[3, 0, 12, 1, 0], [], [9]]]) {
    const { buckets } = divisionLibrary(groups);
    assertNoOverlap(layoutMap("category", buckets, new Set()).boxes);
    const all = new Set(buckets.map((b) => b.id));
    assertNoOverlap(layoutMap("category", buckets, all).boxes);
  }
});

test("starts each level below the tallest card above it", () => {
  const { buckets } = school();
  const layout = layoutMap("category", buckets, new Set(["category:d0c2"]));

  for (const link of layout.links) {
    const source = box(layout, link.source);
    const target = box(layout, link.target);
    assert.ok(target.y >= source.y + source.height + LEVEL_GAP);
    assert.ok(link.busY > source.y + source.height && link.busY < target.y);
  }
});

test("expanding a card moves nothing sideways", () => {
  const { buckets } = school();
  const before = layoutMap("category", buckets, new Set());
  const after = layoutMap("category", buckets, new Set(["category:d2c3"]));

  for (const [id, { x, y }] of before.boxes) {
    assert.equal(box(after, id).x, x, id);
    assert.equal(box(after, id).y, y, id);
  }
  assert.ok(box(after, "category:d2c3").height > box(before, "category:d2c3").height);
});

test("hangs unfiled documents off the hub beside the divisions", () => {
  const { buckets } = divisionLibrary([[1], [1]]);
  const withLoose = groupByDivision(
    [...buckets.flatMap((b) => b.docs), doc()],
    [
      { id: "d0c0", name: "C", color: "#000", division_id: "d0" },
      { id: "d1c0", name: "C", color: "#000", division_id: "d1" },
    ],
    [
      { id: "d0", name: "D0", sort_order: 0, color: "#000" },
      { id: "d1", name: "D1", sort_order: 1, color: "#000" },
    ]
  );
  const layout = layoutMap("category", withLoose, new Set());

  assert.equal(box(layout, UNSORTED_CATEGORY_ID).y, box(layout, "division:d0").y);
  assert.ok(box(layout, UNSORTED_CATEGORY_ID).x > box(layout, "division:d1").x);
});

test("draws the folder tree one level per depth", () => {
  const buckets = groupByFolder(docs(3, { folder_id: "forms" }), tree);
  const layout = layoutMap("folder", buckets, new Set());

  const y = (id: string) => box(layout, `folder:${id}`).y;
  assert.equal(y("admissions"), y("sports"));
  assert.equal(y("aquatics"), y("forms"));
  assert.ok(y("forms") > y("sports"));
  assert.ok(y("fall") > y("forms"));
  assertNoOverlap(layout.boxes);
  assert.deepEqual(
    layout.links.map((l) => [l.source, l.target]),
    [
      [hubId("folder"), "folder:admissions"],
      [hubId("folder"), "folder:sports"],
      ["folder:sports", "folder:aquatics"],
      ["folder:sports", "folder:forms"],
      ["folder:forms", "folder:fall"],
    ]
  );
});

test("routes a link down to its bar, across, and down again", () => {
  assert.deepEqual(
    routeLink({ x: 100, y: 50 }, { x: 300, y: 200 }, { busY: 160 }),
    [
      { x: 100, y: 50 },
      { x: 100, y: 160 },
      { x: 300, y: 160 },
      { x: 300, y: 200 },
    ]
  );
});

test("turns halfway when a dragged card leaves the bar outside the gap", () => {
  const corners = routeLink({ x: 0, y: 0 }, { x: 50, y: 100 }, { busY: 400 });
  assert.equal(corners?.[1].y, 50);
});

test("gives up routing when the target is dragged above its source", () => {
  assert.equal(
    routeLink({ x: 0, y: 100 }, { x: 50, y: 40 }, { busY: 70 }),
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
