/**
 * Checks that each citation points at the passage its fact came from.
 *
 * "Every [N] resolves to a source" is not enough: with several passages per
 * document, [1] can be a real source and still the wrong page. This checks the
 * verifiable specifics — times, phone numbers, emails, amounts, other numbers —
 * in each cited clause against the text of the passages that clause cites.
 * Prose is paraphrased and can't be checked this way; specifics are copied
 * verbatim (the prompt requires it), so a specific missing from its cited
 * passage means the citation points somewhere else.
 */

export interface CitationMismatch {
  /** The cited numbers of the clause. */
  cited: number[];
  /** The specific that none of those passages contain. */
  token: string;
  clause: string;
}

const CITATION_GROUP_RE = /((?:\s*\[\d+\])+)/g;

const SPECIFIC_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, // email
  /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/g, // phone
  /\b\d{1,2}:\d{2}\b/g, // time
  /\$\s?\d[\d,]*(?:\.\d{2})?/g, // money
  /\b\d{2,}\b/g, // any other number of 2+ digits
];

const digitsOnly = (s: string) => s.replace(/\D/g, "");

/** The verifiable specifics in a piece of answer text. */
export function extractSpecifics(text: string): string[] {
  const found: string[] = [];
  let rest = text;
  for (const re of SPECIFIC_PATTERNS) {
    for (const m of rest.matchAll(re)) found.push(m[0].trim());
    // Consume matches so a phone number isn't re-counted as three numbers.
    rest = rest.replace(re, " ");
  }
  return [...new Set(found)];
}

function passageContains(rawPassage: string, token: string): boolean {
  // PDF text layers split glyph runs ("December 2 1", "hjones@ school.org"),
  // so the model's correctly copied "21" wouldn't be found verbatim. Close
  // gaps inside numbers and around @ before comparing.
  const passage = rawPassage
    .replace(/(\d)\s+(?=\d)/g, "$1")
    .replace(/\s*@\s*/g, "@");
  if (token.includes("@")) return passage.toLowerCase().includes(token.toLowerCase());
  if (token.includes(":")) return passage.includes(token);
  // Phone numbers, amounts and plain numbers are compared on digits, so
  // "(555) 123-4567" matches "555.123.4567" and "$1,200" matches "1200".
  const digits = digitsOnly(token);
  if (digits.length >= 7) return digitsOnly(passage).includes(digits);
  return new RegExp(`(?<!\\d)${digits}(?!\\d)`).test(passage.replace(/(\d),(\d)/g, "$1$2"));
}

/**
 * Split an answer into cited clauses — the text since the previous citation
 * or sentence end, paired with the numbers that follow it.
 */
export function citedClauses(answer: string): { clause: string; cited: number[] }[] {
  const clauses: { clause: string; cited: number[] }[] = [];
  let cursor = 0;
  for (const m of answer.matchAll(CITATION_GROUP_RE)) {
    const before = answer.slice(cursor, m.index);
    // Only the current sentence belongs to this citation.
    const sentenceStart = Math.max(
      before.lastIndexOf(". "),
      before.lastIndexOf("\n"),
      before.lastIndexOf("? "),
      before.lastIndexOf("! ")
    );
    const clause = before.slice(sentenceStart + 1).trim();
    const cited = [...m[1].matchAll(/\d+/g)].map((n) => Number(n[0]));
    if (clause) clauses.push({ clause, cited });
    cursor = m.index! + m[0].length;
  }
  return clauses;
}

/**
 * Every specific in a cited clause that is absent from all of the passages the
 * clause cites. `passages[n - 1]` is the text of source n.
 */
export function findCitationMismatches(answer: string, passages: string[]): CitationMismatch[] {
  const mismatches: CitationMismatch[] = [];
  for (const { clause, cited } of citedClauses(answer)) {
    const texts = cited.map((n) => passages[n - 1]).filter((t): t is string => !!t);
    if (texts.length === 0) continue; // an unresolvable number is a separate check
    for (const token of extractSpecifics(clause)) {
      if (!texts.some((t) => passageContains(t, token))) {
        mismatches.push({ cited, token, clause });
      }
    }
  }
  return mismatches;
}
