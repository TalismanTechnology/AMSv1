/**
 * Categories grouped by division. Every division (Lower, Middle, Upper
 * School) and the whole school carry the same short list of categories, so a
 * document is sorted first by who it's for, then by what it's about.
 */

export const WHOLE_SCHOOL = "Whole School";

/** Created when a school has no divisions yet, as migration 018 seeds them. */
export const DEFAULT_DIVISIONS = [
  { name: "Lower School", color: "sky" },
  { name: "Middle School", color: "violet" },
  { name: "Upper School", color: "emerald" },
];

/** The categories each group starts with. "Other" catches what fits nowhere. */
export const STARTER_CATEGORIES = [
  {
    name: "Academics",
    color: "#3b82f6",
    description:
      "Classes, curriculum, homework, grades and report cards, exams, course selection and academic support.",
  },
  {
    name: "Athletics & Activities",
    color: "#f97316",
    description:
      "Sports teams, tryouts, practices and game schedules, music, theater, visual arts, clubs and after-school programs.",
  },
  {
    name: "Events & Calendar",
    color: "#8b5cf6",
    description:
      "Dates and schedules: field trips, assemblies, ceremonies, conferences, holidays and school events.",
  },
  {
    name: "Policies, Health & Forms",
    color: "#ef4444",
    description:
      "Handbooks, rules, dress code, attendance, tuition and fees, enrollment, the nurse, medications, allergies, immunizations, safety, and forms to fill in.",
  },
  {
    name: "Other",
    color: "#64748b",
    description: "Anything that doesn't clearly fit another category in its group.",
  },
] as const;

export interface DivisionLike {
  id: string;
  name: string;
  sort_order: number;
}

export interface GroupedCategory {
  id: string;
  name: string;
  /** The division it belongs to; null or missing for the whole school. */
  division_id?: string | null;
  sort_order?: number | null;
}

export interface CategoryGroup<C extends GroupedCategory> {
  /** Null for the whole school. */
  divisionId: string | null;
  name: string;
  categories: C[];
}

/** The category that catches documents nothing else in its group fits. */
export function isFallbackCategory(category: { name: string }): boolean {
  return category.name.trim().toLowerCase() === "other";
}

/** Group order: "Other" last, then sort_order, then name. */
function byOrder<C extends GroupedCategory>(a: C, b: C): number {
  return (
    Number(isFallbackCategory(a)) - Number(isFallbackCategory(b)) ||
    (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

/**
 * Categories in their groups: each division in its calendar order, then the
 * whole school. A category whose division no longer exists counts as whole
 * school. Groups without categories are left out unless `keepEmpty` is set.
 */
export function groupCategories<C extends GroupedCategory>(
  categories: C[],
  divisions: DivisionLike[],
  { keepEmpty = false }: { keepEmpty?: boolean } = {}
): CategoryGroup<C>[] {
  const ordered = [...divisions].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );
  const known = new Set(ordered.map((d) => d.id));
  const groups: CategoryGroup<C>[] = ordered.map((division) => ({
    divisionId: division.id,
    name: division.name,
    categories: categories
      .filter((c) => c.division_id === division.id)
      .sort(byOrder),
  }));
  groups.push({
    divisionId: null,
    name: WHOLE_SCHOOL,
    categories: categories
      .filter((c) => !c.division_id || !known.has(c.division_id))
      .sort(byOrder),
  });
  return keepEmpty
    ? groups
    : groups.filter((group) => group.categories.length > 0);
}

/**
 * How each category is named where groups would otherwise be ambiguous,
 * e.g. "Upper School · Academics". A school that hasn't moved to division
 * categories (every category is whole-school) keeps plain names.
 */
export function categoryLabels(
  categories: GroupedCategory[],
  divisions: DivisionLike[],
  separator = " · "
): Map<string, string> {
  const grouped = categories.some(
    (c) => c.division_id && divisions.some((d) => d.id === c.division_id)
  );
  const labels = new Map<string, string>();
  for (const group of groupCategories(categories, divisions)) {
    for (const category of group.categories) {
      labels.set(
        category.id,
        grouped ? `${group.name}${separator}${category.name}` : category.name
      );
    }
  }
  return labels;
}

/** Whether a school's categories are grouped by division. */
export function hasDivisionCategories(categories: GroupedCategory[]): boolean {
  return categories.some((c) => !!c.division_id);
}

/**
 * The categories a document may be sorted into. A document marked for
 * divisions (by the division address its email reached) stays within those
 * divisions' categories; otherwise every category is open to it.
 */
export function candidateCategories<C extends GroupedCategory>(
  categories: C[],
  divisionIds: string[]
): C[] {
  if (!divisionIds.length) return categories;
  const within = categories.filter(
    (c) => c.division_id && divisionIds.includes(c.division_id)
  );
  return within.length ? within : categories;
}

/**
 * Where a document goes when the classifier finds no fit: "Other" in the
 * first division it's marked for, or the whole school's "Other". Null when
 * there is no such category, so the document stays unfiled.
 */
export function fallbackCategory<C extends GroupedCategory>(
  categories: C[],
  divisionIds: string[]
): C | null {
  const others = categories.filter(isFallbackCategory);
  for (const divisionId of divisionIds) {
    const other = others.find((c) => c.division_id === divisionId);
    if (other) return other;
  }
  return others.find((c) => !c.division_id) ?? null;
}
