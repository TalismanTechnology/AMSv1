/**
 * The sorting map: every document drawn inside the card for the category or
 * folder it was sorted into, the way a schema visualizer draws columns inside
 * tables. A hub card lists every card and links to it, and in the folder view
 * each folder links to its subfolders.
 *
 * Pure data and geometry, no React, so the grouping and layout can be tested.
 */

export type MapView = "category" | "folder";

/** The fields of a document the map reads. */
export interface MapDocument {
  id: string;
  title: string;
  file_type: string;
  status: string;
  source?: "upload" | "email";
  category_id: string | null;
  folder_id: string | null;
}

export interface MapCategory {
  id: string;
  name: string;
  color: string;
}

export interface MapFolder {
  id: string;
  name: string;
  parent_id: string | null;
}

/** One card on the map: a category or folder and the documents sorted into it. */
export interface Bucket<D extends MapDocument = MapDocument> {
  /** Node id on the map, prefixed by view so the two maps never share one. */
  id: string;
  /** "unsorted" is the card for documents with no category, or no folder. */
  kind: "category" | "folder" | "unsorted";
  /** The category or folder to file a document under; null for unsorted. */
  targetId: string | null;
  name: string;
  /** The category's colour; null for folders and the unsorted card. */
  color: string | null;
  /** Documents sorted directly into this bucket, in the order given. */
  docs: D[];
  /** Folder view: ids of the buckets for the folders directly inside this one. */
  children: string[];
  /** Documents here plus in every folder beneath it. */
  total: number;
  /** Folder view: 0 for a top-level folder. Always 0 in the category view. */
  depth: number;
}

export const UNSORTED_CATEGORY_ID = "category:none";
export const UNSORTED_FOLDER_ID = "folder:none";

export function hubId(view: MapView): string {
  return `hub:${view}`;
}

/** Handle id of the row a link leaves from: the row that names its target. */
export function rowHandleId(bucketId: string): string {
  return `row:${bucketId}`;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

/**
 * One bucket per category, in the order given, then a "No category" bucket
 * for documents without one (left out when there are none). A category id
 * that matches no category counts as none.
 */
export function groupByCategory<D extends MapDocument>(
  docs: D[],
  categories: MapCategory[]
): Bucket<D>[] {
  const filed = new Map<string, D[]>(categories.map((c) => [c.id, []]));
  const unsorted: D[] = [];

  for (const doc of docs) {
    const bucket = doc.category_id ? filed.get(doc.category_id) : undefined;
    if (bucket) bucket.push(doc);
    else unsorted.push(doc);
  }

  const buckets: Bucket<D>[] = categories.map((category) => {
    const inCategory = filed.get(category.id) ?? [];
    return {
      id: `category:${category.id}`,
      kind: "category",
      targetId: category.id,
      name: category.name,
      color: category.color,
      docs: inCategory,
      children: [],
      total: inCategory.length,
      depth: 0,
    };
  });

  if (unsorted.length) {
    buckets.push({
      id: UNSORTED_CATEGORY_ID,
      kind: "unsorted",
      targetId: null,
      name: "No category",
      color: null,
      docs: unsorted,
      children: [],
      total: unsorted.length,
      depth: 0,
    });
  }

  return buckets;
}

/**
 * The folder tree, depth first with siblings in name order, then a
 * "No folder" bucket for documents outside every folder (left out when there
 * are none). A folder whose parent is missing, or whose parent chain loops
 * back to itself, is shown at the top level, so a bad parent_id can neither
 * hide folders nor recurse forever.
 */
export function groupByFolder<D extends MapDocument>(
  docs: D[],
  folders: MapFolder[]
): Bucket<D>[] {
  const folderById = new Map(folders.map((f) => [f.id, f]));

  const onCycle = (folder: MapFolder): boolean => {
    const seen = new Set<string>();
    let parentId = folder.parent_id;
    while (parentId && !seen.has(parentId)) {
      if (parentId === folder.id) return true;
      seen.add(parentId);
      parentId = folderById.get(parentId)?.parent_id ?? null;
    }
    return false;
  };

  const childrenOf = new Map<string | null, MapFolder[]>();
  for (const folder of folders) {
    const parentId =
      folder.parent_id && folderById.has(folder.parent_id) && !onCycle(folder)
        ? folder.parent_id
        : null;
    const siblings = childrenOf.get(parentId) ?? [];
    siblings.push(folder);
    childrenOf.set(parentId, siblings);
  }
  for (const siblings of childrenOf.values()) siblings.sort(byName);

  const docsIn = new Map<string, D[]>(folders.map((f) => [f.id, []]));
  const unsorted: D[] = [];
  for (const doc of docs) {
    const bucket = doc.folder_id ? docsIn.get(doc.folder_id) : undefined;
    if (bucket) bucket.push(doc);
    else unsorted.push(doc);
  }

  const buckets: Bucket<D>[] = [];
  const visit = (folder: MapFolder, depth: number): Bucket<D> => {
    const inFolder = docsIn.get(folder.id) ?? [];
    const bucket: Bucket<D> = {
      id: `folder:${folder.id}`,
      kind: "folder",
      targetId: folder.id,
      name: folder.name,
      color: null,
      docs: inFolder,
      children: [],
      total: inFolder.length,
      depth,
    };
    buckets.push(bucket);

    for (const child of childrenOf.get(folder.id) ?? []) {
      const childBucket = visit(child, depth + 1);
      bucket.children.push(childBucket.id);
      bucket.total += childBucket.total;
    }
    return bucket;
  };

  for (const root of childrenOf.get(null) ?? []) visit(root, 0);

  if (unsorted.length) {
    buckets.push({
      id: UNSORTED_FOLDER_ID,
      kind: "unsorted",
      targetId: null,
      name: "No folder",
      color: null,
      docs: unsorted,
      children: [],
      total: unsorted.length,
      depth: 0,
    });
  }

  return buckets;
}

/** The buckets the hub card lists, one row and one link each. */
export function hubBuckets<D extends MapDocument>(
  view: MapView,
  buckets: Bucket<D>[]
): Bucket<D>[] {
  return view === "category" ? buckets : buckets.filter((b) => b.depth === 0);
}

/** Search text as the map compares it; "" means no search. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesQuery(doc: { title: string }, query: string): boolean {
  return query !== "" && doc.title.toLowerCase().includes(query);
}

/**
 * Buckets that hold a match, counting matches anywhere beneath a folder, so
 * the links down to a matching subfolder light up as well.
 */
export function bucketsWithMatches<D extends MapDocument>(
  buckets: Bucket<D>[],
  query: string
): Set<string> {
  const hits = new Set<string>();
  if (!query) return hits;

  // Buckets come parent first, so walking backwards reaches every child
  // before its parent.
  for (let i = buckets.length - 1; i >= 0; i--) {
    const bucket = buckets[i];
    if (
      bucket.docs.some((doc) => matchesQuery(doc, query)) ||
      bucket.children.some((childId) => hits.has(childId))
    ) {
      hits.add(bucket.id);
    }
  }
  return hits;
}

// ── Geometry ──────────────────────────────────────────
// Cards are drawn to these sizes (see components/admin/sorting-map-nodes.tsx),
// so the layout can place them before the browser has measured anything.

export const CARD_WIDTH = 288;
export const HEADER_HEIGHT = 40;
export const ROW_HEIGHT = 34;
/** Documents a card lists before folding the rest behind "Show all". */
export const PREVIEW_ROWS = 8;
/** A card's 1px border, top and bottom. */
const CARD_BORDER = 2;

/** Gap between the hub and the first column of cards; links bend inside it. */
export const HUB_GAP = 136;
/** Gap between columns of cards in the category view. */
export const COLUMN_GAP = 56;
/** Gap between a folder and the column of its subfolders. */
export const TREE_GAP = 112;
/** Gap between columns of top-level folders in the folder view. */
export const BLOCK_GAP = 96;
/** Vertical gap between cards stacked in one column. */
export const STACK_GAP = 32;
/** How far above the top row of cards the overhead lane runs. */
const OVERHEAD_CLEARANCE = 18;
/** The width-to-height ratio each view picks its column count for. */
const TARGET_ASPECT = 1.6;
const MAX_COLUMNS = 4;

/** How many of a bucket's documents its card lists. */
export function shownDocCount(bucket: Bucket, expanded: boolean): number {
  return expanded
    ? bucket.docs.length
    : Math.min(bucket.docs.length, PREVIEW_ROWS);
}

/** Whether a card has a "Show all" / "Show less" row. */
export function hasMoreRow(bucket: Bucket): boolean {
  return bucket.docs.length > PREVIEW_ROWS;
}

/**
 * Rows under a card's header: subfolders, then documents, then "Show all" when
 * some are folded away. An empty card shows a single placeholder row.
 */
export function cardRowCount(bucket: Bucket, expanded: boolean): number {
  const rows =
    bucket.children.length +
    shownDocCount(bucket, expanded) +
    (hasMoreRow(bucket) ? 1 : 0);
  return Math.max(rows, 1);
}

export function cardHeight(bucket: Bucket, expanded: boolean): number {
  return (
    CARD_BORDER + HEADER_HEIGHT + cardRowCount(bucket, expanded) * ROW_HEIGHT
  );
}

/** The hub lists one row per bucket, or a single placeholder row. */
export function hubHeight(rowCount: number): number {
  return CARD_BORDER + HEADER_HEIGHT + Math.max(rowCount, 1) * ROW_HEIGHT;
}

/**
 * Top for a card whose header should sit level with row `index` of the card
 * whose top is `top`, so the link between them runs straight across.
 */
function levelWithRow(top: number, index: number): number {
  return top + HEADER_HEIGHT / 2 + index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

export interface Box {
  x: number;
  y: number;
  height: number;
}

export interface MapLink {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  /** The gap the link crosses first; it bends halfway across. */
  gutter: number;
  /**
   * Set when other cards stand between the link's ends. The link climbs to a
   * lane at `y` above every card and drops back down in the gap left of its
   * target, `approach` wide. Run straight across instead, it would pass
   * behind the cards in between and seem to join them.
   */
  overhead?: { y: number; approach: number };
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The corners of a link from a row's right edge to a card's left edge: out
 * into the source's gutter, along it, then across to the target, by way of
 * the overhead lane when the link has one. Null when the target has been
 * dragged back over the gutter, where there is no sensible corner to turn.
 */
export function routeLink(
  source: Point,
  target: Point,
  link: Pick<MapLink, "gutter" | "overhead">
): Point[] | null {
  const bendX = source.x + link.gutter / 2;
  if (target.x <= bendX) return null;

  if (link.overhead) {
    const dropX = target.x - link.overhead.approach / 2;
    const laneY = link.overhead.y;
    if (dropX > bendX) {
      return [
        source,
        { x: bendX, y: source.y },
        { x: bendX, y: laneY },
        { x: dropX, y: laneY },
        { x: dropX, y: target.y },
        target,
      ];
    }
  }

  return [source, { x: bendX, y: source.y }, { x: bendX, y: target.y }, target];
}

/** An SVG path through right-angled corners, each rounded off by `radius`. */
export function roundedPath(points: Point[], radius: number): string {
  // Drop repeated points and the middle of straight runs; what's left turns.
  const corners: Point[] = [];
  for (const point of points) {
    const last = corners[corners.length - 1];
    if (last && last.x === point.x && last.y === point.y) continue;
    const before = corners[corners.length - 2];
    if (
      before &&
      last &&
      ((before.x === last.x && last.x === point.x) ||
        (before.y === last.y && last.y === point.y))
    ) {
      corners.pop();
    }
    corners.push(point);
  }
  if (!corners.length) return "";

  const step = (from: Point, to: Point, by: number): Point => ({
    x: from.x + Math.sign(to.x - from.x) * by,
    y: from.y + Math.sign(to.y - from.y) * by,
  });
  const length = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  let path = `M ${corners[0].x},${corners[0].y}`;
  for (let i = 1; i < corners.length - 1; i++) {
    const [prev, corner, next] = [corners[i - 1], corners[i], corners[i + 1]];
    const r = Math.min(radius, length(prev, corner) / 2, length(corner, next) / 2);
    const into = step(corner, prev, r);
    const out = step(corner, next, r);
    path += ` L ${into.x},${into.y} Q ${corner.x},${corner.y} ${out.x},${out.y}`;
  }
  const end = corners[corners.length - 1];
  return corners.length > 1 ? `${path} L ${end.x},${end.y}` : path;
}

export interface MapLayout {
  /** Where each card goes, the hub included, keyed by node id. */
  boxes: Map<string, Box>;
  links: MapLink[];
}

/**
 * The heights cards are packed into columns by: each card folded, as the map
 * first draws it. Holding these fixed while the map is open keeps every card
 * in its column when a card expands or a document moves to another card.
 */
export type PackingBasis = ReadonlyMap<string, number>;

export function packingBasis(buckets: Bucket[]): PackingBasis {
  return new Map(buckets.map((b) => [b.id, cardHeight(b, false)]));
}

/**
 * Place the hub and every card. `expanded` holds the ids of cards showing all
 * their documents. Columns are assigned from `basis`, so a card that grows or
 * shrinks only moves the cards below it in its own column.
 */
export function layoutMap(
  view: MapView,
  buckets: Bucket[],
  expanded: ReadonlySet<string>,
  basis: PackingBasis = packingBasis(buckets)
): MapLayout {
  return view === "category"
    ? layoutCategories(buckets, expanded, basis)
    : layoutFolders(buckets, expanded, basis);
}

/** Something to stack in a column: a category card, or a folder's subtree. */
interface Stackable {
  /** Height the basis gives it, or undefined if the basis predates it. */
  basisHeight: number | undefined;
  /** Height it is drawn at now. */
  height: number;
  width: number;
}

/**
 * Masonry columns: each item goes under whichever column is shortest so far.
 * The column count is the one that brings the map closest to TARGET_ASPECT,
 * judged on the items the basis knows. Items it doesn't know, like a
 * category added since the map opened, are placed after those, so they can't
 * push known items into other columns. Returns each item's top-left corner.
 */
function stackInColumns(
  items: Stackable[],
  { left, top, gap, minHeight }: { left: number; top: number; gap: number; minHeight: number }
): Point[] {
  const indices = items.map((_, i) => i);
  const known = indices.filter((i) => items[i].basisHeight !== undefined);
  const order = [...known, ...indices.filter((i) => items[i].basisHeight === undefined)];
  const packHeight = (i: number) => items[i].basisHeight ?? items[i].height;

  const assign = (subset: number[], columns: number) => {
    const bottoms: number[] = new Array(columns).fill(top);
    const widths: number[] = new Array(columns).fill(0);
    const columnOf = new Map<number, number>();
    for (const i of subset) {
      let column = 0;
      for (let c = 1; c < columns; c++) {
        if (bottoms[c] < bottoms[column]) column = c;
      }
      columnOf.set(i, column);
      bottoms[column] += packHeight(i) + STACK_GAP;
      widths[column] = Math.max(widths[column], items[i].width);
    }
    const right = left + widths.reduce((sum, w) => sum + w, 0) + gap * (columns - 1);
    const bottom = Math.max(...bottoms) - STACK_GAP;
    return { columnOf, right, bottom };
  };

  const judged = known.length ? known : order;
  let columns = 1;
  let bestScore = Infinity;
  for (let count = 1; count <= Math.min(MAX_COLUMNS, Math.max(judged.length, 1)); count++) {
    const packed = assign(judged, count);
    const height = Math.max(minHeight, packed.bottom);
    const score = Math.abs(Math.log(packed.right / height / TARGET_ASPECT));
    if (score < bestScore) {
      bestScore = score;
      columns = count;
    }
  }
  const { columnOf } = assign(order, columns);

  // Stack each column in packing order at the heights drawn now.
  const widths: number[] = new Array(columns).fill(0);
  for (const i of order) {
    const column = columnOf.get(i) ?? 0;
    widths[column] = Math.max(widths[column], items[i].width);
  }
  const lefts: number[] = [];
  let x = left;
  for (const width of widths) {
    lefts.push(x);
    x += width + gap;
  }
  const nextTop: number[] = new Array(columns).fill(top);
  const corners: Point[] = new Array(items.length);
  for (const i of order) {
    const column = columnOf.get(i) ?? 0;
    corners[i] = { x: lefts[column], y: nextTop[column] };
    nextTop[column] += items[i].height + STACK_GAP;
  }
  return corners;
}

/** The hub on the left and the category cards in columns to its right. */
function layoutCategories(
  buckets: Bucket[],
  expanded: ReadonlySet<string>,
  basis: PackingBasis
): MapLayout {
  const hub = hubId("category");
  const hubBox: Box = { x: 0, y: 0, height: hubHeight(buckets.length) };
  const left = CARD_WIDTH + HUB_GAP;
  // The first card's header sits level with the hub's first row.
  const top = levelWithRow(0, 0);

  const items = buckets.map((bucket) => ({
    basisHeight: basis.get(bucket.id),
    height: cardHeight(bucket, expanded.has(bucket.id)),
    width: CARD_WIDTH,
  }));
  const corners = stackInColumns(items, {
    left,
    top,
    gap: COLUMN_GAP,
    minHeight: hubBox.height,
  });

  const boxes = new Map<string, Box>([[hub, hubBox]]);
  const overheadY = top - OVERHEAD_CLEARANCE;
  const links: MapLink[] = buckets.map((bucket, i) => {
    boxes.set(bucket.id, { ...corners[i], height: items[i].height });
    return {
      id: `${hub}->${bucket.id}`,
      source: hub,
      sourceHandle: rowHandleId(bucket.id),
      target: bucket.id,
      gutter: HUB_GAP,
      // Cards past the first column have cards in front of them.
      overhead:
        corners[i].x > left ? { y: overheadY, approach: COLUMN_GAP } : undefined,
    };
  });

  return { boxes, links };
}

/** One top-level folder and everything beneath it, laid out from (0, 0). */
interface Block {
  boxes: Map<string, Box>;
  links: MapLink[];
  width: number;
  height: number;
}

/**
 * A subtree read left to right, one column per level. A card sits level with
 * the row that links to it when there is room, and lower otherwise.
 */
function layoutSubtree(
  root: Bucket,
  bucketById: Map<string, Bucket>,
  heightOf: (bucket: Bucket) => number
): Block {
  const boxes = new Map<string, Box>();
  const links: MapLink[] = [];
  /** First free y in each level's column. */
  const nextTop: number[] = [];
  let width = CARD_WIDTH;

  const place = (bucket: Bucket, ideal: number) => {
    const level = bucket.depth - root.depth;
    const x = level * (CARD_WIDTH + TREE_GAP);
    const top = Math.max(nextTop[level] ?? 0, ideal);
    const height = heightOf(bucket);
    boxes.set(bucket.id, { x, y: top, height });
    nextTop[level] = top + height + STACK_GAP;
    width = Math.max(width, x + CARD_WIDTH);

    bucket.children.forEach((childId, index) => {
      const child = bucketById.get(childId);
      if (!child) return;
      links.push({
        id: `${bucket.id}->${child.id}`,
        source: bucket.id,
        sourceHandle: rowHandleId(child.id),
        target: child.id,
        gutter: TREE_GAP,
      });
      place(child, levelWithRow(top, index));
    });
  };

  place(root, 0);
  return { boxes, links, width, height: Math.max(...nextTop) - STACK_GAP };
}

/**
 * The hub, then each top-level folder's subtree as a block, the blocks
 * stacked in as many columns as brings the map closest to TARGET_ASPECT.
 */
function layoutFolders(
  buckets: Bucket[],
  expanded: ReadonlySet<string>,
  basis: PackingBasis
): MapLayout {
  const hub = hubId("folder");
  const bucketById = new Map(buckets.map((b) => [b.id, b]));
  const roots = hubBuckets("folder", buckets);
  const hubBox: Box = { x: 0, y: 0, height: hubHeight(roots.length) };
  const left = CARD_WIDTH + HUB_GAP;
  // The first folder's header sits level with the hub's first row.
  const top = levelWithRow(0, 0);

  const blocks = roots.map((root) =>
    layoutSubtree(root, bucketById, (b) => cardHeight(b, expanded.has(b.id)))
  );
  const items = roots.map((root, i) => ({
    basisHeight: basis.has(root.id)
      ? layoutSubtree(
          root,
          bucketById,
          (b) => basis.get(b.id) ?? cardHeight(b, false)
        ).height
      : undefined,
    height: blocks[i].height,
    width: blocks[i].width,
  }));
  const corners = stackInColumns(items, {
    left,
    top,
    gap: BLOCK_GAP,
    minHeight: hubBox.height,
  });

  const boxes = new Map<string, Box>([[hub, hubBox]]);
  const links: MapLink[] = [];
  const overheadY = top - OVERHEAD_CLEARANCE;

  roots.forEach((root, i) => {
    const corner = corners[i];
    for (const [id, box] of blocks[i].boxes) {
      boxes.set(id, { x: box.x + corner.x, y: box.y + corner.y, height: box.height });
    }
    links.push({
      id: `${hub}->${root.id}`,
      source: hub,
      sourceHandle: rowHandleId(root.id),
      target: root.id,
      gutter: HUB_GAP,
      // Blocks past the first column have other folders in front of them.
      overhead:
        corner.x > left ? { y: overheadY, approach: BLOCK_GAP } : undefined,
    });
    links.push(...blocks[i].links);
  });

  return { boxes, links };
}
