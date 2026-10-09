import { formatGrade } from "@/lib/grades";

/**
 * Keep children's names out of everything sent to the AI provider.
 *
 * The model only ever needed a child's GRADE: documents are organised by grade
 * and division, never by a child's name. Names were used purely so answers
 * could say "For Mia, …" — personalisation, not retrieval — so they are
 * replaced by grade-based labels ("your 8th Grade child") in the system
 * prompt, the query rewrite, and the conversation itself (when a parent types
 * "what about Mia?", the model sees "what about [your 8th Grade child]?").
 *
 * Names still live in our own database and the parent's own chat history;
 * only the copy that leaves for Google is rewritten.
 */

export interface NamedChild {
  name: string;
  grade: string;
}

export interface LabelledChild {
  /** How the model refers to the child, e.g. "your 8th Grade child". */
  label: string;
  /** Spelled-out grade level, e.g. "8th Grade". */
  grade: string;
}

/**
 * One label per child, in the same order. Children in the same grade (twins)
 * get a number so the model can still keep them apart.
 */
export function labelChildren(children: NamedChild[]): LabelledChild[] {
  const grades = children.map((c) => formatGrade(c.grade) || "unknown grade");
  const totals = new Map<string, number>();
  for (const g of grades) totals.set(g, (totals.get(g) ?? 0) + 1);
  const seen = new Map<string, number>();
  return grades.map((grade) => {
    const n = (seen.get(grade) ?? 0) + 1;
    seen.set(grade, n);
    const suffix = (totals.get(grade) ?? 0) > 1 ? ` #${n}` : "";
    return { label: `your ${grade} child${suffix}`, grade };
  });
}

// First names that are also everyday words. On their own these are replaced
// only when capitalised mid-sentence ("Can Will bring a snack?"), never at the
// start of a sentence ("Will school close early?") or in lower case.
const WORD_NAMES = new Set([
  "will", "grace", "hope", "faith", "joy", "rose", "lily", "ivy", "iris",
  "mark", "bill", "art", "pat", "sky", "sunny", "honor", "chance", "story",
  "river", "rain", "sage", "jack", "frank", "dawn", "eve", "summer", "autumn",
  "winter", "christian", "royal", "true", "drew", "chase", "hunter",
]);

// Names that are also months or days are never replaced on their own: a child
// called May would otherwise turn "Is school closed in May?" into nonsense.
const CALENDAR_NAMES = new Set([
  "january", "april", "may", "june", "july", "august",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NOT_WORD_BEFORE = "(?<![\\p{L}\\p{N}])";
const NOT_WORD_AFTER = "(?![\\p{L}\\p{N}])";

/** Whole-word, case-insensitive matcher (letters and digits are word chars). */
function wordRegExp(term: string): RegExp {
  return new RegExp(`${NOT_WORD_BEFORE}${escapeRegExp(term)}${NOT_WORD_AFTER}`, "giu");
}

/**
 * Case-sensitive, capitalised, and not at the start of the text or of a
 * sentence — the only place a word-name is reliably a name.
 */
function midSentenceNameRegExp(term: string): RegExp {
  const cap = term.charAt(0).toUpperCase() + term.slice(1).toLowerCase();
  return new RegExp(
    `(?<=[\\p{L}\\p{N},;:'"()\\-]\\s+)${escapeRegExp(cap)}${NOT_WORD_AFTER}`,
    "gu"
  );
}

/**
 * Replace every child's name in `text` with that child's label in brackets,
 * e.g. "Is Mia's class on a trip?" -> "Is [your 3rd Grade child]'s class on a
 * trip?". Full names first, then first names on their own (with the
 * word-name and calendar-name caveats above).
 */
export function redactChildNames(text: string, children: NamedChild[]): string {
  if (!text || children.length === 0) return text;
  const labels = labelChildren(children);

  const rules: { re: RegExp; length: number; replacement: string }[] = [];
  children.forEach((child, i) => {
    const full = child.name.trim().replace(/\s+/g, " ");
    if (full.length < 2) return;
    const replacement = `[${labels[i].label}]`;
    const first = full.split(" ")[0];
    const firstKey = first.toLowerCase();

    if (first !== full) {
      rules.push({ re: wordRegExp(full), length: full.length, replacement });
    }
    if (first.length < 2 || CALENDAR_NAMES.has(firstKey)) return;
    rules.push({
      re: WORD_NAMES.has(firstKey) ? midSentenceNameRegExp(first) : wordRegExp(first),
      length: first.length,
      replacement,
    });
  });

  // Longest first so "Mia Lopez" is replaced before "Mia".
  rules.sort((a, b) => b.length - a.length);
  let out = text;
  for (const { re, replacement } of rules) out = out.replace(re, replacement);
  return out;
}

/** redactChildNames over every text part of a list of UI messages. */
export function redactChildNamesInMessages<
  M extends { parts?: Array<{ type: string; text?: string }> },
>(messages: M[], children: NamedChild[]): M[] {
  if (children.length === 0) return messages;
  return messages.map((m) => ({
    ...m,
    parts: Array.isArray(m.parts)
      ? m.parts.map((p) =>
          p.type === "text" && typeof p.text === "string"
            ? { ...p, text: redactChildNames(p.text, children) }
            : p
        )
      : m.parts,
  }));
}
