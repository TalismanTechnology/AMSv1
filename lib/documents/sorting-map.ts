/**
 * The sorting map: a tree growing down from an "All documents" hub. In the
 * division view the hub branches into the whole school and each division, and
 * each of those into its own categories, every document listed inside the
 * card for the category it was sorted into. In the folder view the hub
 * branches into the top-level folders, and each folder into its subfolders.
 *
 * Pure data and geometry, no React, so the grouping and layout can be tested.
 */

import { groupCategories } from "./division-categories";

/** "category" is the division view: divisions, then their categories. */
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
  /** The category's division; null or missing for the whole school. */
  division_id?: string | null;
  sort_order?: number | null;
}

export interface MapDivision {
  id: string;
  name: string;
  sort_order: number;
  /** Hex colour for the division's card. */
  color: string;
}

export interface MapFolder {
  id: string;
  name: string;
  parent_id: string | null;
}

/** One card on the map, and a row in the card above it. */
export interface Bucket<D extends MapDocument = MapDocument> {
  /** Node id on the map, prefixed by view so the two maps never share one. */
  id: string;
  /**
   * "division" groups categories (a division, or the whole school); "unsorted"
   * holds documents with no category, or no folder.
   */
  kind: "division" | "category" | "folder" | "unsorted";
  /** The category or folder to file a document under; null otherwise. */
  targetId: string | null;
  name: string;
  /** The division or whole school a category belongs to, for its label. */
  group?: string;
  /** Category or division colour; null for folders and the unsorted card. */
  color: string | null;
  /** Documents sorted directly into this bucket, in the order given. */
  docs: D[];
  /** Ids of the buckets that branch from this one: categories or subfolders. */
  children: string[];
  /** Documents here plus in everything beneath it. */
  total: number;
  /** 0 for the hub's branches; 1 for a division's categories, and so on. */
  depth: number;
}

export const UNSORTED_CATEGORY_ID = "category:none";
export const UNSORTED_FOLDER_ID = "folder:none";

/** The colour the whole school's card is drawn in: the app's forest green. */
export const WHOLE_SCHOOL_COLOR = "#3d5a3e";

export function hubId(view: MapView): string {
  return `hub:${view}`;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

/**
 * The division view: one bucket for the whole school, then one per division,
 * each followed by its categories, then "No category" for documents without
 * one (left out when there are none). Every category gets a card, empty or
 * not, so each division shows all its branches. A category id that matches no
 * category counts as none.
 */
export function groupByDivision<D extends MapDocument>(
  docs: D[],
  categories: MapCategory[],
  divisions: MapDivision[]
): Bucket<D>[] {
  const filed = new Map<string, D[]>(categories.map((c) => [c.id, []]));
  const unsorted: D[] = [];
  for (const doc of docs) {
    const bucket = doc.category_id ? filed.get(doc.category_id) : undefined;
    if (bucket) bucket.push(doc);
    else unsorted.push(doc);
  }

  const colorOf = new Map(divisions.map((d) => [d.id, d.color]));
  const buckets: Bucket<D>[] = [];
  const groups = groupCategories(categories, divisions);
  // The whole school spans every division, so it leads the row.
  groups.sort((a, b) => Number(a.divisionId !== null) - Number(b.divisionId !== null));
  for (const group of groups) {
    const children = group.categories.map((category) => {
      const inCategory = filed.get(category.id) ?? [];
      return {
        id: `category:${category.id}`,
        kind: "category" as const,
        targetId: category.id,
        name: category.name,
        group: group.name,
        color: category.color,
        docs: inCategory,
        children: [],
        total: inCategory.length,
        depth: 1,
      };
    });
    buckets.push(
      {
        id: `division:${group.divisionId ?? "whole"}`,
        kind: "division",
        targetId: null,
        name: group.name,
        color:
          (group.divisionId && colorOf.get(group.divisionId)) || WHOLE_SCHOOL_COLOR,
        docs: [],
        children: children.map((c) => c.id),
        total: children.reduce((sum, c) => sum + c.total, 0),
        depth: 0,
      },
      ...children
    );
  }

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

/** The buckets that branch straight from the hub. */
export function hubBuckets<D extends MapDocument>(
  buckets: Bucket<D>[]
): Bucket<D>[] {
  return buckets.filter((b) => b.depth === 0);
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

export const CARD_WIDTH = 248;
export const HEADER_HEIGHT = 40;
export const ROW_HEIGHT = 34;
/** Documents a card lists before folding the rest behind "Show all". */
export const PREVIEW_ROWS = 6;
/** A card's 1px border, top and bottom. */
const CARD_BORDER = 2;

/** Gap between one level of the tree and the next; links branch halfway down it. */
export const LEVEL_GAP = 72;
/** Gap between cards that share a parent. */
export const SIBLING_GAP = 20;
/** Gap between the hub's branches: divisions, or top-level folders. */
export const BRANCH_GAP = 64;

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
 * Rows under a card's header: documents, then "Show all" when some are folded
 * away. A division is a header alone, its categories drawn as branches below
 * it; so is a folder holding only subfolders. Any other empty card shows a
 * single placeholder row.
 */
export function cardRowCount(bucket: Bucket, expanded: boolean): number {
  if (bucket.kind === "division") return 0;
  const rows = shownDocCount(bucket, expanded) + (hasMoreRow(bucket) ? 1 : 0);
  return rows || (bucket.children.length ? 0 : 1);
}

export function cardHeight(bucket: Bucket, expanded: boolean): number {
  return (
    CARD_BORDER + HEADER_HEIGHT + cardRowCount(bucket, expanded) * ROW_HEIGHT
  );
}

/** The hub is a header alone, with a placeholder row while it has no branches. */
export function hubHeight(branchCount: number): number {
  return CARD_BORDER + HEADER_HEIGHT + (branchCount ? 0 : ROW_HEIGHT);
}

export interface Box {
  x: number;
  y: number;
  height: number;
}

export interface MapLink {
  id: string;
  source: string;
  target: string;
  /**
   * Where the link turns sideways: halfway down the gap above its target's
   * level, so every link into a level branches off one shared bar.
   */
  busY: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The corners of a link from the bottom of a card to the top of one below:
 * down to the bar, along it, and down again. Null when the target has been
 * dragged up level with or above its source, where there is no sensible
 * corner to turn.
 */
export function routeLink(
  source: Point,
  target: Point,
  link: Pick<MapLink, "busY">
): Point[] | null {
  if (target.y <= source.y) return null;
  // A dragged card can leave the bar outside the gap; turn halfway instead.
  const y =
    link.busY > source.y && link.busY < target.y
      ? link.busY
      : (source.y + target.y) / 2;
  return [source, { x: source.x, y }, { x: target.x, y }, target];
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
 * Place the hub and every card as a tree growing downwards: the hub on top,
 * its branches (divisions, or top-level folders) in a row beneath it, and each
 * one's categories or subfolders in a row beneath that. Every card is centred
 * over its own children, and each level starts below the tallest card of the
 * level above. `expanded` holds the ids of cards showing all their documents.
 */
export function layoutMap(
  view: MapView,
  buckets: Bucket[],
  expanded: ReadonlySet<string>
): MapLayout {
  const hub = hubId(view);
  const bucketById = new Map(buckets.map((b) => [b.id, b]));
  const roots = hubBuckets(buckets);

  const childrenOf = (id: string): Bucket[] =>
    id === hub
      ? roots
      : (bucketById.get(id)?.children ?? []).flatMap((childId) => {
          const child = bucketById.get(childId);
          return child ? [child] : [];
        });
  const heightOf = (id: string): number => {
    const bucket = bucketById.get(id);
    return bucket ? cardHeight(bucket, expanded.has(id)) : hubHeight(roots.length);
  };
  const gapUnder = (id: string) => (id === hub ? BRANCH_GAP : SIBLING_GAP);

  // How wide each subtree is, and how tall each level's tallest card is.
  const width = new Map<string, number>();
  const levelHeights: number[] = [];
  const measure = (id: string, level: number): number => {
    levelHeights[level] = Math.max(levelHeights[level] ?? 0, heightOf(id));
    const children = childrenOf(id);
    const span =
      children.reduce((sum, child) => sum + measure(child.id, level + 1), 0) +
      gapUnder(id) * Math.max(children.length - 1, 0);
    const subtree = Math.max(CARD_WIDTH, span);
    width.set(id, subtree);
    return subtree;
  };
  measure(hub, 0);

  const levelTops = [0];
  for (let level = 1; level < levelHeights.length; level++) {
    levelTops[level] = levelTops[level - 1] + levelHeights[level - 1] + LEVEL_GAP;
  }

  const boxes = new Map<string, Box>();
  const links: MapLink[] = [];
  const place = (id: string, left: number, level: number) => {
    const subtree = width.get(id) ?? CARD_WIDTH;
    boxes.set(id, {
      x: left + (subtree - CARD_WIDTH) / 2,
      y: levelTops[level],
      height: heightOf(id),
    });

    const children = childrenOf(id);
    const span =
      children.reduce((sum, child) => sum + (width.get(child.id) ?? 0), 0) +
      gapUnder(id) * Math.max(children.length - 1, 0);
    let x = left + (subtree - span) / 2;
    for (const child of children) {
      links.push({
        id: `${id}->${child.id}`,
        source: id,
        target: child.id,
        busY: levelTops[level + 1] - LEVEL_GAP / 2,
      });
      place(child.id, x, level + 1);
      x += (width.get(child.id) ?? 0) + gapUnder(id);
    }
  };
  place(hub, 0, 0);

  return { boxes, links };
}
