/**
 * The sorting map: a tree of boxes that open on click. All documents opens
 * into the whole school and each division, each of those into its
 * categories, each category into the kinds of document filed there (Email,
 * PDF, Word…), and each kind into a list of its documents. The folder view
 * opens the folder tree the same way.
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
 * The division view: one bucket for the whole school, then one per division
 * (each shown even with no categories yet), each followed by its categories, then "No category" for documents without
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
  // Every division gets a box, even before it has categories of its own.
  const groups = groupCategories(categories, divisions, { keepEmpty: true });
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

// ── Tree ──────────────────────────────────────────────

/**
 * One box on the map. Below the divisions (or folders) sit the kinds of
 * document filed there, and below each kind a list of its documents.
 */
export interface TreeNode<D extends MapDocument = MapDocument> {
  /** Node id on the map; unique within a view. */
  id: string;
  kind: "root" | "division" | "category" | "folder" | "unsorted" | "type" | "list";
  name: string;
  /** Category or division colour; null where there is none. */
  color: string | null;
  /** Documents at or beneath this box. */
  count: number;
  /** The boxes that open beneath this one when it is clicked. */
  children: TreeNode<D>[];
  /** A "type" box's documents, which its "list" box shows. */
  docs: D[];
  /**
   * Whether a document dragged onto this box is filed under `targetId`. A
   * division is a group of categories, not a place to file a document.
   */
  droppable: boolean;
  /** The category or folder a dropped document is filed under; null for none. */
  targetId: string | null;
  /** The division a category belongs to, to name where a document moved. */
  group?: string;
  /** Set under "No category" / "No folder", where documents can be sorted by AI. */
  unsorted?: boolean;
}

/** The kinds of document a box splits into, in the order they're shown. */
const DOC_TYPES = [
  { key: "email", label: "Email" },
  { key: "pdf", label: "PDF" },
  { key: "docx", label: "Word" },
  { key: "xlsx", label: "Spreadsheet" },
  { key: "pptx", label: "Slides" },
  { key: "txt", label: "Text" },
] as const;

/** The kind a document is: email by how it arrived, otherwise by file type. */
export function docTypeOf(doc: MapDocument): { key: string; label: string } {
  const key =
    doc.source === "email" || doc.file_type === "eml"
      ? "email"
      : doc.file_type.toLowerCase();
  return (
    DOC_TYPES.find((t) => t.key === key) ?? { key, label: key.toUpperCase() }
  );
}

function typeNodes<D extends MapDocument>(
  parentId: string,
  docs: D[],
  file: Pick<TreeNode<D>, "color" | "targetId" | "group" | "unsorted">
): TreeNode<D>[] {
  const byType = new Map<string, { label: string; docs: D[] }>();
  for (const doc of docs) {
    const { key, label } = docTypeOf(doc);
    const entry = byType.get(key) ?? { label, docs: [] };
    entry.docs.push(doc);
    byType.set(key, entry);
  }
  const order = (key: string) => {
    const index = DOC_TYPES.findIndex((t) => t.key === key);
    return index === -1 ? DOC_TYPES.length : index;
  };
  return [...byType.entries()]
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([key, { label, docs: ofType }]) => {
      const id = `${parentId}/type:${key}`;
      const list: TreeNode<D> = {
        id: `${id}/list`,
        kind: "list",
        name: label,
        count: ofType.length,
        children: [],
        docs: ofType,
        droppable: true,
        ...file,
      };
      return {
        id,
        kind: "type" as const,
        name: label,
        count: ofType.length,
        children: [list],
        docs: ofType,
        droppable: true,
        ...file,
      };
    });
}

/**
 * The map as a tree: All documents, then the whole school and each division
 * (or the top-level folders), then their categories (or subfolders), then the
 * kinds of document in each, then the documents themselves.
 */
export function buildTree<D extends MapDocument>(
  view: MapView,
  buckets: Bucket<D>[]
): TreeNode<D> {
  const bucketById = new Map(buckets.map((b) => [b.id, b]));

  const toNode = (bucket: Bucket<D>): TreeNode<D> => {
    const file = {
      color: bucket.color,
      targetId: bucket.targetId,
      group: bucket.group,
      unsorted: bucket.kind === "unsorted" || undefined,
    };
    const subtrees = bucket.children.flatMap((childId) => {
      const child = bucketById.get(childId);
      return child ? [toNode(child)] : [];
    });
    return {
      id: bucket.id,
      kind: bucket.kind,
      name: bucket.name,
      count: bucket.total,
      children: [...subtrees, ...typeNodes(bucket.id, bucket.docs, file)],
      docs: [],
      droppable: bucket.kind !== "division",
      ...file,
    };
  };

  const roots = hubBuckets(buckets).map(toNode);
  return {
    id: hubId(view),
    kind: "root",
    name: "All documents",
    color: null,
    count: roots.reduce((sum, r) => sum + r.count, 0),
    children: roots,
    docs: [],
    droppable: false,
    targetId: null,
  };
}

/** Every box in the tree, parents before their children. */
export function walkTree<D extends MapDocument>(root: TreeNode<D>): TreeNode<D>[] {
  const out: TreeNode<D>[] = [];
  const visit = (node: TreeNode<D>) => {
    out.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return out;
}

/** Each box's parent, by id. */
export function parentsOf(root: TreeNode): Map<string, string> {
  const parents = new Map<string, string>();
  for (const node of walkTree(root)) {
    for (const child of node.children) parents.set(child.id, node.id);
  }
  return parents;
}

/**
 * The boxes to open so every document matching the search is on show: each
 * box with a match beneath it, down to the lists the matches are in.
 */
export function openForMatches(root: TreeNode, query: string): Set<string> {
  const open = new Set<string>();
  if (!query) return open;
  const visit = (node: TreeNode): boolean => {
    let hit = node.kind === "list" && node.docs.some((d) => matchesQuery(d, query));
    for (const child of node.children) if (visit(child)) hit = true;
    if (hit && node.children.length) open.add(node.id);
    return hit;
  };
  visit(root);
  return open;
}

/** Boxes with a match at or beneath them, so the path down to it lights up. */
export function nodesWithMatches(root: TreeNode, query: string): Set<string> {
  const hits = new Set<string>();
  if (!query) return hits;
  const visit = (node: TreeNode): boolean => {
    let hit = node.docs.some((d) => matchesQuery(d, query));
    for (const child of node.children) if (visit(child)) hit = true;
    if (hit) hits.add(node.id);
    return hit;
  };
  visit(root);
  return hits;
}

// ── Geometry ──────────────────────────────────────────
// Boxes are drawn to these sizes (see components/admin/sorting-map-nodes.tsx),
// so the layout can place them before the browser has measured anything.

export const NODE_WIDTH = 232;
export const NODE_HEIGHT = 60;
export const LIST_WIDTH = 280;
export const ROW_HEIGHT = 34;
/** Rows a document list shows before it scrolls. */
export const LIST_ROWS = 8;
/** A box's 1px border, top and bottom. */
const BORDER = 2;

/** Gap between one level of the tree and the next. */
export const LEVEL_GAP = 64;
/** Gap between boxes side by side. */
export const SIBLING_GAP = 20;

export function nodeSize(node: TreeNode): { width: number; height: number } {
  if (node.kind !== "list") return { width: NODE_WIDTH, height: NODE_HEIGHT };
  const rows = Math.max(1, Math.min(node.docs.length, LIST_ROWS));
  return { width: LIST_WIDTH, height: BORDER + rows * ROW_HEIGHT };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapLink {
  id: string;
  source: string;
  target: string;
}

export interface MapLayout<D extends MapDocument = MapDocument> {
  /** The boxes on show, parents before their children. */
  nodes: TreeNode<D>[];
  /** Where each box on show goes, keyed by id. */
  boxes: Map<string, Box>;
  links: MapLink[];
}

/**
 * Place the boxes on show: the root, and beneath every open box its
 * children, in a row centred under it. Each level starts below the tallest
 * box of the level above, and no two boxes overlap.
 */
export function layoutTree<D extends MapDocument>(
  root: TreeNode<D>,
  open: ReadonlySet<string>
): MapLayout<D> {
  const shownChildren = (node: TreeNode<D>) =>
    open.has(node.id) ? node.children : [];

  const width = new Map<string, number>();
  const levelHeights: number[] = [];
  const measure = (node: TreeNode<D>, level: number): number => {
    const size = nodeSize(node);
    levelHeights[level] = Math.max(levelHeights[level] ?? 0, size.height);
    const children = shownChildren(node);
    const span =
      children.reduce((sum, child) => sum + measure(child, level + 1), 0) +
      SIBLING_GAP * Math.max(children.length - 1, 0);
    const subtree = Math.max(size.width, span);
    width.set(node.id, subtree);
    return subtree;
  };
  measure(root, 0);

  const levelTops = [0];
  for (let level = 1; level < levelHeights.length; level++) {
    levelTops[level] = levelTops[level - 1] + levelHeights[level - 1] + LEVEL_GAP;
  }

  const nodes: TreeNode<D>[] = [];
  const boxes = new Map<string, Box>();
  const links: MapLink[] = [];
  const place = (node: TreeNode<D>, left: number, level: number) => {
    const size = nodeSize(node);
    const subtree = width.get(node.id) ?? size.width;
    nodes.push(node);
    boxes.set(node.id, {
      x: left + (subtree - size.width) / 2,
      y: levelTops[level],
      ...size,
    });

    const children = shownChildren(node);
    const span =
      children.reduce((sum, child) => sum + (width.get(child.id) ?? 0), 0) +
      SIBLING_GAP * Math.max(children.length - 1, 0);
    let x = left + (subtree - span) / 2;
    for (const child of children) {
      links.push({ id: `${node.id}->${child.id}`, source: node.id, target: child.id });
      place(child, x, level + 1);
      x += (width.get(child.id) ?? 0) + SIBLING_GAP;
    }
  };
  place(root, 0, 0);

  return { nodes, boxes, links };
}
