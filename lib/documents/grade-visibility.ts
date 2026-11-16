import { GRADE_VALUES, formatGrade } from "@/lib/grades";

// Which parents may see a document. A document's visible_grades (migration
// 051) is null for all parents, or the grades whose parents may see it — set
// from the intake address an email arrived at, or by an admin in the library.
// The same rule lives in SQL (can_view_document_grades and the *_v2
// retrieval functions); this is the app's copy, for service-role paths
// (chat retrieval, push) that don't go through RLS. Pure — no I/O.

/** Who is looking: admins see everything; a parent, by their children's grades. */
export type DocumentViewer =
  | { seeAll: true }
  | { seeAll: false; grades: string[] };

export const ALL_DOCUMENTS_VIEWER: DocumentViewer = { seeAll: true };

/** A child as far as visibility is concerned. */
export interface ViewerChild {
  grade: string | null | undefined;
  /** Graduated children no longer count (children.graduated_at). */
  graduated?: boolean;
}

/**
 * The viewer for a signed-in user in one school. Admins (school admins and
 * super-admins) see everything. A parent sees by the grades of their current
 * children in that school; with none on file, only documents for all parents.
 */
export function viewerFor(params: {
  isAdmin: boolean;
  children: readonly ViewerChild[];
}): DocumentViewer {
  if (params.isAdmin) return ALL_DOCUMENTS_VIEWER;
  const grades = params.children
    .filter((c) => !c.graduated && c.grade && GRADE_VALUES.includes(c.grade))
    .map((c) => c.grade as string);
  return { seeAll: false, grades: sortGrades(grades) };
}

/** True when a document with these grades is for every parent. */
export function isForAllParents(visibleGrades: readonly string[] | null | undefined): boolean {
  return !visibleGrades || visibleGrades.length === 0;
}

/**
 * The rule: everyone sees a document for all parents; admins see everything;
 * a parent sees a restricted document when one of their children is in one of
 * its grades.
 */
export function canViewDocument(
  visibleGrades: readonly string[] | null | undefined,
  viewer: DocumentViewer
): boolean {
  if (isForAllParents(visibleGrades)) return true;
  if (viewer.seeAll) return true;
  return viewer.grades.some((g) => visibleGrades!.includes(g));
}

/** Grades in school order (Pre-K, K, 1…12), without repeats or unknown values. */
export function sortGrades(grades: Iterable<string>): string[] {
  const set = new Set(grades);
  return GRADE_VALUES.filter((g) => set.has(g));
}

/**
 * Validate grades sent by a client. null, undefined or [] mean all parents
 * (returned as null, which is what is stored). Unknown values are an error,
 * never silently dropped: dropping one could hide a document from parents an
 * admin meant to include.
 */
export function normalizeVisibleGrades(
  input: unknown
): { grades: string[] | null } | { error: string } {
  if (input === null || input === undefined) return { grades: null };
  if (!Array.isArray(input)) return { error: "Grades must be a list." };
  const unknown = input.filter((g) => typeof g !== "string" || !GRADE_VALUES.includes(g));
  if (unknown.length) {
    return { error: `Unknown grade${unknown.length === 1 ? "" : "s"}: ${unknown.map(String).join(", ")}` };
  }
  const grades = sortGrades(input as string[]);
  return { grades: grades.length ? grades : null };
}

/**
 * The audience of two sources combined: all parents if either is for all
 * parents, else every grade in either. Used when one email reached several
 * addresses, or a later copy of a document reached another list.
 */
export function mergeVisibleGrades(
  a: readonly string[] | null | undefined,
  b: readonly string[] | null | undefined
): string[] | null {
  if (isForAllParents(a) || isForAllParents(b)) return null;
  return sortGrades([...a!, ...b!]);
}

/**
 * "All parents", "Grade 9", "Grades 6–8", "Pre-K–K", "Grades K, 3, 6–8".
 * Runs of consecutive grades collapse into ranges.
 */
export function formatVisibleGrades(visibleGrades: readonly string[] | null | undefined): string {
  if (isForAllParents(visibleGrades)) return "All parents";
  const grades = sortGrades(visibleGrades!);
  if (grades.length === 0) return "All parents";
  if (grades.length === GRADE_VALUES.length) return "All grades";
  if (grades.length === 1) {
    const only = grades[0];
    return /^\d+$/.test(only) ? `Grade ${only}` : formatGrade(only);
  }

  const index = (g: string) => GRADE_VALUES.indexOf(g);
  const runs: string[][] = [];
  for (const g of grades) {
    const run = runs[runs.length - 1];
    if (run && index(g) === index(run[run.length - 1]) + 1) run.push(g);
    else runs.push([g]);
  }
  const parts = runs.map((run) =>
    run.length === 1 ? run[0] : `${run[0]}–${run[run.length - 1]}`
  );
  return grades.some((g) => /^\d+$/.test(g)) ? `Grades ${parts.join(", ")}` : parts.join(", ");
}

/**
 * Split push recipients by which of the documents each may see, so every
 * parent hears only about documents they can open. Parents who can see none
 * are left out. Groups keep the documents' order.
 */
export function groupRecipientsByVisibleDocuments<D extends { id: string; visibleGrades: string[] | null }>(
  documents: readonly D[],
  recipients: readonly string[],
  childrenByParent: ReadonlyMap<string, readonly ViewerChild[]>
): { recipients: string[]; documents: D[] }[] {
  const groups = new Map<string, { recipients: string[]; documents: D[] }>();
  for (const parent of recipients) {
    const viewer = viewerFor({ isAdmin: false, children: childrenByParent.get(parent) ?? [] });
    const visible = documents.filter((d) => canViewDocument(d.visibleGrades, viewer));
    if (!visible.length) continue;
    const key = visible.map((d) => d.id).join(",");
    const group = groups.get(key) ?? { recipients: [], documents: visible };
    group.recipients.push(parent);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * Admin rulings on conflicting documents quote both sides. Keep a ruling for
 * a viewer only when each side is a document the viewer's own retrieval
 * returned (the database already checked those) or one for all parents, so
 * a ruling can't carry a restricted document's words to a parent who can't
 * see it.
 */
export function conflictsInReach<C extends { a: { document_id: string }; b: { document_id: string } }>(
  conflicts: readonly C[],
  reachable: ReadonlySet<string>,
  forAllParents: ReadonlySet<string>
): C[] {
  const ok = (id: string) => reachable.has(id) || forAllParents.has(id);
  return conflicts.filter((c) => ok(c.a.document_id) && ok(c.b.document_id));
}
