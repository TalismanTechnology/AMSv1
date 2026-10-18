// Pure rules for Auto-folder: which documents it may move, and turning an AI
// proposal into a plan that is safe to apply. No database access here, so the
// rules are unit-tested; the server action re-runs them before writing.

import {
  RESPONSES_FOLDER_NAME,
  WEBSITE_FOLDER_NAME,
  descendantIds,
  type FolderLike,
} from "./folders";

/** "Unfiled only", or every document outside Website and Responses. */
export type AutoFolderScope = "unfiled" | "all";

export const AUTO_FOLDER_MIN_FOLDERS = 6;
export const AUTO_FOLDER_MAX_FOLDERS = 12;
/** Longest folder name kept; longer AI names are cut at a word boundary. */
export const AUTO_FOLDER_NAME_MAX = 60;

export interface AutoFolderFolder extends FolderLike {
  school_id: string;
}

export interface AutoFolderDoc {
  id: string;
  title: string;
  school_id: string;
  folder_id: string | null;
  source?: string | null;
  status?: string | null;
}

/** What the model (or the client, on apply) asks for. */
export interface AutoFolderProposal {
  assignments: { documentId: string; folder: string }[];
}

export interface AutoFolderMove {
  documentId: string;
  title: string;
  /** Where it is now; null when unfiled. */
  fromFolderId: string | null;
  /** The target root folder's name, as it will appear. */
  folder: string;
}

export interface AutoFolderTarget {
  name: string;
  /** Set when an existing root folder of the school is reused. */
  existingId: string | null;
  count: number;
}

export interface AutoFolderPlan {
  /** Root folders the plan uses, new ones included, largest first. */
  folders: AutoFolderTarget[];
  moves: AutoFolderMove[];
  /** Assignments dropped, with why; for logs and the preview's footnote. */
  skipped: { documentId: string; reason: string }[];
}

const key = (name: string) => name.trim().toLowerCase();

const PROTECTED = [WEBSITE_FOLDER_NAME, RESPONSES_FOLDER_NAME].map(key);

/** "Website" or "Responses", in any case. */
export function isProtectedFolderName(name: string): boolean {
  return PROTECTED.includes(key(cleanFolderName(name)));
}

/**
 * Every folder named Website or Responses (at any level) and everything
 * beneath them. Documents in these are never moved, and nothing is moved in.
 */
export function protectedFolderIds(folders: FolderLike[]): Set<string> {
  const ids = new Set<string>();
  for (const folder of folders) {
    if (isProtectedFolderName(folder.name)) {
      for (const id of descendantIds(folders, folder.id)) ids.add(id);
    }
  }
  return ids;
}

/**
 * Tidy an AI folder name: single spaces, no slashes (they read as paths), no
 * surrounding quotes or punctuation, at most AUTO_FOLDER_NAME_MAX characters.
 * Returns "" when nothing usable is left.
 */
export function cleanFolderName(raw: string): string {
  let name = String(raw ?? "")
    .replace(/[\\/]+/g, " - ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'`“”‘’\s.-]+|["'`“”‘’\s.-]+$/g, "")
    .trim();
  if (name.length > AUTO_FOLDER_NAME_MAX) {
    const cut = name.slice(0, AUTO_FOLDER_NAME_MAX);
    const space = cut.lastIndexOf(" ");
    name = (space > 20 ? cut.slice(0, space) : cut).replace(/[\s,&-]+$/, "");
  }
  return name;
}

/**
 * The documents Auto-folder may move for this school: ready, not synced from
 * the website, not in a protected folder, and for "unfiled" not in any folder.
 */
export function autoFolderCandidates<D extends AutoFolderDoc>(
  docs: D[],
  folders: AutoFolderFolder[],
  schoolId: string,
  scope: AutoFolderScope
): D[] {
  const schoolFolders = folders.filter((f) => f.school_id === schoolId);
  const known = new Set(schoolFolders.map((f) => f.id));
  const locked = protectedFolderIds(schoolFolders);
  return docs.filter((doc) => {
    if (doc.school_id !== schoolId) return false;
    if (doc.status != null && doc.status !== "ready") return false;
    if (doc.source === "website") return false;
    if (doc.folder_id === null) return true;
    if (scope === "unfiled") return false;
    // A folder of another school, or one that's gone, isn't ours to judge.
    return known.has(doc.folder_id) && !locked.has(doc.folder_id);
  });
}

/** The school's root folders Auto-folder may reuse (not Website/Responses). */
export function reusableRootFolders(
  folders: AutoFolderFolder[],
  schoolId: string
): AutoFolderFolder[] {
  return folders.filter(
    (f) => f.school_id === schoolId && !f.parent_id && !isProtectedFolderName(f.name)
  );
}

/**
 * Turn a proposal into a plan that only does what Auto-folder is allowed to:
 * - documents must be candidates (this school, ready, not website-synced, not
 *   in Website/Responses, and unfiled when the scope says so); unknown ids,
 *   repeats and moves into the folder a document is already in are dropped;
 * - folder names are cleaned and deduplicated ignoring case, and resolve to
 *   the school's existing root folder of that name when there is one;
 * - Website and Responses are never a target;
 * - at most AUTO_FOLDER_MAX_FOLDERS targets, keeping the most used.
 * Never deletes, renames or moves folders: the plan only creates root folders
 * and sets documents' folder.
 */
export function sanitizeAutoFolderProposal(input: {
  schoolId: string;
  scope: AutoFolderScope;
  folders: AutoFolderFolder[];
  docs: AutoFolderDoc[];
  proposal: AutoFolderProposal;
  maxFolders?: number;
}): AutoFolderPlan {
  const { schoolId, scope, proposal } = input;
  const maxFolders = input.maxFolders ?? AUTO_FOLDER_MAX_FOLDERS;
  const candidates = new Map(
    autoFolderCandidates(input.docs, input.folders, schoolId, scope).map((d) => [d.id, d])
  );
  const roots = new Map<string, AutoFolderFolder>();
  for (const folder of reusableRootFolders(input.folders, schoolId)) {
    // Root names are unique per school only by exact case; the first wins.
    if (!roots.has(key(folder.name))) roots.set(key(folder.name), folder);
  }

  const skipped: AutoFolderPlan["skipped"] = [];
  const seenDocs = new Set<string>();
  const wanted: { doc: AutoFolderDoc; name: string }[] = [];
  const displayName = new Map<string, string>();

  for (const assignment of proposal.assignments ?? []) {
    const documentId = String(assignment?.documentId ?? "");
    const doc = candidates.get(documentId);
    if (!doc) {
      skipped.push({ documentId, reason: "not a document Auto-folder may move" });
      continue;
    }
    if (seenDocs.has(documentId)) {
      skipped.push({ documentId, reason: "assigned twice" });
      continue;
    }
    const name = cleanFolderName(assignment.folder);
    if (!name) {
      skipped.push({ documentId, reason: "no folder name" });
      continue;
    }
    if (isProtectedFolderName(name)) {
      skipped.push({ documentId, reason: `${name} is reserved` });
      continue;
    }
    seenDocs.add(documentId);
    const k = key(name);
    if (!displayName.has(k)) displayName.set(k, roots.get(k)?.name ?? name);
    wanted.push({ doc, name: k });
  }

  // Keep the most used targets; existing folders win ties, then by name.
  const counts = new Map<string, number>();
  for (const w of wanted) counts.set(w.name, (counts.get(w.name) ?? 0) + 1);
  const kept = new Set(
    [...counts.entries()]
      .sort(
        ([a, x], [b, y]) =>
          y - x ||
          Number(roots.has(b)) - Number(roots.has(a)) ||
          a.localeCompare(b)
      )
      .slice(0, Math.max(0, maxFolders))
      .map(([name]) => name)
  );

  const moves: AutoFolderMove[] = [];
  const used = new Map<string, number>();
  for (const { doc, name } of wanted) {
    if (!kept.has(name)) {
      skipped.push({ documentId: doc.id, reason: "too many folders proposed" });
      continue;
    }
    const existing = roots.get(name);
    if (existing && doc.folder_id === existing.id) {
      skipped.push({ documentId: doc.id, reason: "already in that folder" });
      continue;
    }
    moves.push({
      documentId: doc.id,
      title: doc.title,
      fromFolderId: doc.folder_id,
      folder: displayName.get(name)!,
    });
    used.set(name, (used.get(name) ?? 0) + 1);
  }

  const folders: AutoFolderTarget[] = [...used.entries()]
    .map(([name, count]) => ({
      name: displayName.get(name)!,
      existingId: roots.get(name)?.id ?? null,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return { folders, moves, skipped };
}
