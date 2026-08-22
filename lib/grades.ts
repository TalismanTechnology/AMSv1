/** Grade levels a child can be enrolled in. Values are stored in children.grade. */
export const GRADES = [
  { value: "Pre-K", label: "Pre-K" },
  { value: "K", label: "Kindergarten" },
  { value: "1", label: "1st Grade" },
  { value: "2", label: "2nd Grade" },
  { value: "3", label: "3rd Grade" },
  { value: "4", label: "4th Grade" },
  { value: "5", label: "5th Grade" },
  { value: "6", label: "6th Grade" },
  { value: "7", label: "7th Grade" },
  { value: "8", label: "8th Grade" },
  { value: "9", label: "9th Grade" },
  { value: "10", label: "10th Grade" },
  { value: "11", label: "11th Grade" },
  { value: "12", label: "12th Grade" },
] as const;

export const GRADE_VALUES = GRADES.map((grade) => grade.value) as readonly string[];

const GRADE_LABELS = new Map<string, string>(
  GRADES.map((grade) => [grade.value, grade.label])
);

/**
 * Render a stored grade value for display.
 *
 * Values are stored bare ("8", "K"), which is ambiguous everywhere it surfaces
 * — "Lucas (8)" reads as an eight-year-old. Always format before showing a
 * grade to a person or putting one in a prompt. Unrecognised values (legacy
 * free-text from older signups) are passed through unchanged.
 */
export function formatGrade(value: string | null | undefined): string {
  if (!value) return "";
  return GRADE_LABELS.get(value) ?? value;
}
