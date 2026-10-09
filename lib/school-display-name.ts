/**
 * Display helpers for a school's name on public pages (login, welcome).
 *
 * `schools.name` is the source of truth, but it can be blank (a school created
 * before the admin set a name, or a name cleared by mistake), and the
 * `settings.school_name` copy defaults to the product name "AskMySchool",
 * which must never be shown as the school's name. These helpers pick the
 * first real name and give callers a neutral fallback so copy never reads
 * "for 's Blackbaud parent portal".
 */

/** The product's own name, used as the `settings.school_name` default. */
const PRODUCT_NAMES = new Set(["askmyschool", "ask my school"]);

/** The first non-blank candidate that isn't the product's own name, or null. */
export function resolveSchoolName(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const name = candidate?.trim();
    if (name && !PRODUCT_NAMES.has(name.toLowerCase())) return name;
  }
  return null;
}

/** "Collegiate's" or "your school's". */
export function schoolPossessive(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "your school's";
  // "St. James'" reads better than "St. James's" for names ending in s.
  return /s$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}'s`;
}
