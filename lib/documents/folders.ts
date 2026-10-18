// Pure folder helpers shared by the admin library, auto-sort and the
// document processor. No database access here, so they're unit-tested.

export interface FolderLike {
  id: string;
  name: string;
  parent_id: string | null;
}

/** Root folder that website-synced documents are filed into, when it exists. */
export const WEBSITE_FOLDER_NAME = "Website";
/** Reserved for answered-question documents; never an AI choice. */
export const RESPONSES_FOLDER_NAME = "Responses";

/** The library's "Unfiled" entry: documents with no folder. */
export const UNFILED = "unfiled";
/** What the folder tree has selected: a folder id, "Unfiled", or everything (null). */
export type FolderSelection = string | typeof UNFILED | null;

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const byName = (a: FolderLike, b: FolderLike) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) ||
  a.id.localeCompare(b.id);

export type FolderTreeNode<F extends FolderLike> = Omit<F, "children"> & {
  children: FolderTreeNode<F>[];
};

/**
 * Nest folders under their parents, every level sorted alphabetically.
 * A folder whose parent is missing is shown at the root.
 */
export function buildFolderTree<F extends FolderLike>(folders: F[]): FolderTreeNode<F>[] {
  const map = new Map<string, FolderTreeNode<F>>();
  const roots: FolderTreeNode<F>[] = [];

  folders.forEach((f) => map.set(f.id, { ...f, children: [] }));
  folders.forEach((f) => {
    const node = map.get(f.id)!;
    const parent = f.parent_id && f.parent_id !== f.id ? map.get(f.parent_id) : undefined;
    (parent ? parent.children : roots).push(node);
  });

  const sortLevel = (nodes: FolderTreeNode<F>[]) => {
    nodes.sort(byName);
    nodes.forEach((n) => sortLevel(n.children));
  };
  sortLevel(roots);
  return roots;
}

/** A folder and every folder beneath it. Safe against parent_id cycles. */
export function descendantIds(folders: FolderLike[], folderId: string): Set<string> {
  const ids = new Set<string>([folderId]);
  const queue = [folderId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const f of folders) {
      if (f.parent_id === current && !ids.has(f.id)) {
        ids.add(f.id);
        queue.push(f.id);
      }
    }
  }
  return ids;
}

export interface FolderCounts {
  /** Documents in each folder, including its subfolders. */
  byFolder: Map<string, number>;
  total: number;
  unfiled: number;
}

/** Document counts for the folder tree; each folder includes its descendants. */
export function folderDocumentCounts(
  folders: FolderLike[],
  docs: { folder_id: string | null }[]
): FolderCounts {
  const direct = new Map<string, number>();
  let unfiled = 0;
  for (const doc of docs) {
    if (doc.folder_id) direct.set(doc.folder_id, (direct.get(doc.folder_id) ?? 0) + 1);
    else unfiled++;
  }

  const byFolder = new Map<string, number>();
  for (const folder of folders) {
    let count = 0;
    for (const id of descendantIds(folders, folder.id)) count += direct.get(id) ?? 0;
    byFolder.set(folder.id, count);
  }

  return { byFolder, total: docs.length, unfiled };
}

/** The documents a folder-tree selection shows. */
export function filterByFolderSelection<D extends { folder_id: string | null }>(
  docs: D[],
  folders: FolderLike[],
  selection: FolderSelection
): D[] {
  if (selection === null) return docs;
  if (selection === UNFILED) return docs.filter((d) => d.folder_id === null);
  const ids = descendantIds(folders, selection);
  return docs.filter((d) => d.folder_id !== null && ids.has(d.folder_id));
}

/**
 * The school's root "Website" folder, if it has one. Root names are unique
 * per school; an exact-case match wins over a differently-cased one.
 */
export function findWebsiteFolder<F extends FolderLike>(folders: F[]): F | null {
  const roots = folders
    .filter((f) => !f.parent_id && sameName(f.name, WEBSITE_FOLDER_NAME))
    .sort(byName);
  return roots.find((f) => f.name === WEBSITE_FOLDER_NAME) ?? roots[0] ?? null;
}

/**
 * Folders auto-sort may offer the model. "Responses" (and anything under it)
 * is never offered; "Website" is offered only for website-synced documents.
 */
export function autoSortFolderCandidates<F extends FolderLike>(
  folders: F[],
  source: string | null | undefined
): F[] {
  const reserved = [RESPONSES_FOLDER_NAME];
  if (source !== "website") reserved.push(WEBSITE_FOLDER_NAME);

  const excluded = new Set<string>();
  for (const f of folders) {
    if (reserved.some((name) => sameName(f.name, name))) {
      for (const id of descendantIds(folders, f.id)) excluded.add(id);
    }
  }
  return folders.filter((f) => !excluded.has(f.id));
}
