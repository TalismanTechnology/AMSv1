// Pure helpers for the staff contact directory (public.school_contacts,
// migration 044): topic list, missing-table detection, picking the contact
// for an unanswered question, and checking / de-duplicating contacts found in
// documents. No Supabase or AI imports, so everything here is unit tested
// (directory.test.ts) and safe to import from client components.

export const CONTACT_TOPICS = [
  "transportation",
  "health",
  "tuition_billing",
  "schedules_calendar",
  "athletics",
  "admissions",
  "academics",
  "technology",
  "after_school",
  "parents_association",
  "main_office",
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number];

/** The catch-all topic: who a question goes to when no specialist fits. */
export const MAIN_OFFICE: ContactTopic = "main_office";

export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
  transportation: "Transportation",
  health: "Health & nurse",
  tuition_billing: "Tuition & billing",
  schedules_calendar: "Schedules & calendar",
  athletics: "Athletics",
  admissions: "Admissions",
  academics: "Academics",
  technology: "Technology",
  after_school: "After school",
  parents_association: "Parents association",
  main_office: "Main office / general",
};

export function isContactTopic(value: unknown): value is ContactTopic {
  return typeof value === "string" && (CONTACT_TOPICS as readonly string[]).includes(value);
}

/** Known topics only, de-duplicated, in the canonical order. */
export function cleanTopics(values: readonly unknown[]): ContactTopic[] {
  const wanted = new Set(values.filter(isContactTopic));
  return CONTACT_TOPICS.filter((t) => wanted.has(t));
}

export type ContactStatus = "approved" | "suggested" | "rejected";
export type ContactSource = "admin" | "document";

export interface SchoolContact {
  id: string;
  school_id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  division_id: string | null;
  topics: string[];
  status: ContactStatus;
  source: ContactSource;
  source_document_id: string | null;
  source_excerpt: string | null;
  created_at: string;
  updated_at: string;
}

/** What the chat client receives as the `data-contact` part. */
export interface ContactCardData {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  /** The division's name when the contact belongs to one. */
  division: string | null;
}

/** The message shown in admin when migration 044 hasn't been applied. */
export const CONTACTS_TABLE_MISSING_MESSAGE =
  "Contacts directory needs a database update (migration 044_school_contacts.sql).";

/**
 * Does this PostgREST / Postgres error mean public.school_contacts doesn't
 * exist yet? 42P01 is Postgres' undefined_table; PGRST205 is PostgREST's
 * "table not in the schema cache". The message check covers older PostgREST
 * versions that report it without either code.
 */
export function isMissingTableError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return (
    /school_contacts/.test(message) &&
    /does not exist|schema cache|could not find the table/i.test(message)
  );
}

// ── Picking a contact ──────────────────────────────────────────────

export interface ContactSelection<C> {
  contact: C;
  /** "topic" = a specialist for the question; "main_office" = the fallback. */
  matchedBy: "topic" | "main_office";
}

type SelectableContact = Pick<
  SchoolContact,
  "status" | "email" | "phone" | "division_id" | "topics"
>;

function reachable(c: SelectableContact): boolean {
  return !!(c.email?.trim() || c.phone?.trim());
}

/**
 * Rank a contact for the asker's division: their own division first, then the
 * whole school. Another division's contact is only used when the division
 * isn't known — sending a Lower School parent to the Upper School nurse is
 * worse than sending them to the main office. -1 = don't use.
 */
function divisionRank(contactDivision: string | null, divisionId: string | null): number {
  if (divisionId) {
    if (contactDivision === divisionId) return 2;
    return contactDivision === null ? 1 : -1;
  }
  return contactDivision === null ? 1 : 0;
}

function best<C extends SelectableContact>(
  candidates: C[],
  divisionId: string | null
): C | null {
  let winner: C | null = null;
  let winnerRank = -1;
  let winnerBreadth = Infinity;
  for (const c of candidates) {
    const rank = divisionRank(c.division_id, divisionId);
    if (rank < 0) continue;
    // Equal division rank: the more specialised contact (fewer topics) wins;
    // still equal, the earlier one (the caller's order) stays.
    const breadth = c.topics.length;
    if (rank > winnerRank || (rank === winnerRank && breadth < winnerBreadth)) {
      winner = c;
      winnerRank = rank;
      winnerBreadth = breadth;
    }
  }
  return winner;
}

/**
 * The approved contact an unanswered question should be routed to, or null
 * (no card — the chat behaves exactly as it did before contacts existed).
 *
 * A contact covering the question's topic wins, preferring the asker's
 * division; otherwise a main-office contact. A null topic (unclassified)
 * goes straight to the main office.
 */
export function selectContact<C extends SelectableContact>(
  contacts: readonly C[],
  { topic, divisionId = null }: { topic: ContactTopic | null; divisionId?: string | null }
): ContactSelection<C> | null {
  const usable = contacts.filter((c) => c.status === "approved" && reachable(c));

  if (topic && topic !== MAIN_OFFICE) {
    const specialist = best(
      usable.filter((c) => c.topics.includes(topic)),
      divisionId
    );
    if (specialist) return { contact: specialist, matchedBy: "topic" };
  }

  const office = best(
    usable.filter((c) => c.topics.includes(MAIN_OFFICE)),
    divisionId
  );
  return office ? { contact: office, matchedBy: "main_office" } : null;
}

/** Does any approved contact cover something other than the main office? */
export function hasSpecialistContacts(contacts: readonly SelectableContact[]): boolean {
  return contacts.some(
    (c) => c.status === "approved" && c.topics.some((t) => t !== MAIN_OFFICE)
  );
}

/**
 * The division a question names, e.g. "middle school" → the Middle School
 * calendar's id. Matches the full name, or its first word followed by
 * "school" / "schooler(s)" ("the lower schoolers"). Null when none or more
 * than one division is named.
 */
export function detectDivision(
  text: string,
  divisions: readonly { id: string; name: string }[]
): string | null {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const hits = new Set<string>();
  for (const d of divisions) {
    const name = d.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!name) continue;
    const first = name.split(" ")[0];
    const patterns = [` ${name} `];
    if (first && first !== "school") {
      patterns.push(` ${first} school `, ` ${first} schooler `, ` ${first} schoolers `);
    }
    if (patterns.some((p) => haystack.includes(p))) hits.add(d.id);
  }
  return hits.size === 1 ? [...hits][0] : null;
}

// ── The answer prompt's directory ──────────────────────────────────

/** Contacts listed in the answer prompt at most (approved, reachable ones). */
export const MAX_PROMPT_CONTACTS = 40;

type PromptContact = Pick<
  SchoolContact,
  "name" | "role" | "email" | "phone" | "division_id" | "topics" | "status"
>;

/**
 * The school's approved staff contacts as a <staff_contacts> block for the
 * answer prompt, so an answer that sends the parent to a person or office can
 * give that contact's real email / phone. Only approved rows with an email or
 * phone; "" when there are none (the prompt is then exactly as before).
 */
export function formatContactDirectory(
  contacts: readonly PromptContact[],
  divisions: readonly { id: string; name: string }[] = []
): string {
  const lines = contacts
    .filter((c) => c.status === "approved" && reachable(c))
    .slice(0, MAX_PROMPT_CONTACTS)
    .map((c) => {
      const who = [c.name?.trim(), c.role?.trim()].filter(Boolean).join(" — ");
      const division = divisions.find((d) => d.id === c.division_id)?.name;
      const topics = cleanTopics(c.topics).map((t) => CONTACT_TOPIC_LABELS[t]);
      const fields = [
        division ? `Division: ${division}` : "",
        topics.length ? `Handles: ${topics.join(", ")}` : "",
        c.email?.trim() ? `Email: ${c.email.trim()}` : "",
        c.phone?.trim() ? `Phone: ${c.phone.trim()}` : "",
      ].filter(Boolean);
      return `- ${who}${fields.length ? ` | ${fields.join(" | ")}` : ""}`;
    });
  if (lines.length === 0) return "";

  return `<staff_contacts>
${lines.join("\n")}
</staff_contacts>

STAFF CONTACTS
The list above is the school's approved staff directory. Whenever your answer tells the parent to contact a person or office (including "contact the school office"), pick the matching entry and include its email and/or phone exactly as listed. Prefer the parent's division when an entry names one. Never invent, guess, complete, or reformat an email address or phone number: use only details that appear verbatim in this list or in the reference material. If no entry matches, name who to contact without contact details. Don't list contacts the parent doesn't need, and don't cite this list with a source number.`;
}

// ── Links ──────────────────────────────────────────────────────────

/** A tel: href with only what dialers accept (digits, leading +, extension). */
export function telHref(phone: string): string | null {
  const [main, ext] = phone.split(/\s*(?:ext\.?|extension|x)\s*(?=\d)/i);
  const digits = main.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  if (digits.replace(/\D/g, "").length < 7) return null;
  const extDigits = ext?.replace(/\D/g, "");
  return `tel:${digits}${extDigits ? `,${extDigits}` : ""}`;
}

export function mailtoHref(email: string): string | null {
  const trimmed = email.trim();
  return EMAIL_RE.test(trimmed) ? `mailto:${trimmed}` : null;
}

// ── Contacts found in documents ────────────────────────────────────

const EMAIL_RE = /^[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[a-z]{2,}$/i;

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Digits only, without a leading US country code: "1-212-555-0100" → "2125550100". */
export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function normalizeName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Does `needle` appear in `text` exactly (case-insensitive for emails)? */
export function emailAppearsVerbatim(email: string, text: string): boolean {
  const e = email.trim();
  if (!e || !EMAIL_RE.test(e)) return false;
  return text.toLowerCase().includes(e.toLowerCase());
}

/**
 * Does this phone number appear in `text` character for character? Spacing
 * around the number may differ, but its digits and separators must be the
 * document's own — a model that reformats or invents a number is dropped.
 */
export function phoneAppearsVerbatim(phone: string, text: string): boolean {
  const p = phone.trim();
  if (normalizePhone(p).length < 7) return false;
  return text.includes(p);
}

export interface ExtractedContact {
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  topics: string[];
  excerpt: string | null;
}

/**
 * Keep only the parts of an extracted contact that literally appear in the
 * source text: an email or phone the document doesn't contain is dropped,
 * and a contact left with neither is rejected (null). Topics are filtered to
 * the known list; the excerpt is kept only when it is really from the text.
 */
export function verifyExtractedContact(
  contact: ExtractedContact,
  sourceText: string
): ExtractedContact | null {
  const email =
    contact.email && emailAppearsVerbatim(contact.email, sourceText)
      ? contact.email.trim()
      : null;
  const phone =
    contact.phone && phoneAppearsVerbatim(contact.phone, sourceText)
      ? contact.phone.trim()
      : null;
  if (!email && !phone) return null;

  const name = contact.name.trim().slice(0, 120);
  const role = contact.role.trim().slice(0, 120);
  if (!name && !role) return null;

  const excerpt = contact.excerpt?.trim();
  return {
    name,
    role,
    email,
    phone,
    topics: cleanTopics(contact.topics),
    excerpt:
      excerpt && sourceText.includes(excerpt) ? excerpt.slice(0, 500) : null,
  };
}

type DedupeKeyed = Pick<SchoolContact, "email" | "phone" | "name">;

/** Keys that identify the same person: email, phone, or name. */
function identityKeys(c: DedupeKeyed): string[] {
  const keys: string[] = [];
  const email = normalizeEmail(c.email);
  const phone = normalizePhone(c.phone);
  if (email) keys.push(`e:${email}`);
  // A shared switchboard number isn't a person — only use the phone when
  // there's no email to go on.
  if (!email && phone) keys.push(`p:${phone}`);
  const name = normalizeName(c.name);
  if (name && name.includes(" ")) keys.push(`n:${name}`);
  return keys;
}

/**
 * Drop candidates that match an existing row (any status — a rejected
 * suggestion must not come back) or an earlier candidate. Two contacts match
 * on the same email, the same full name, or (with no email) the same phone.
 */
export function dedupeContacts<C extends DedupeKeyed>(
  candidates: readonly C[],
  existing: readonly DedupeKeyed[]
): C[] {
  const seen = new Set(existing.flatMap(identityKeys));
  const out: C[] = [];
  for (const c of candidates) {
    const keys = identityKeys(c);
    if (keys.length === 0 || keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    out.push(c);
  }
  return out;
}

const EMAIL_IN_TEXT_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_IN_TEXT_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

/**
 * The parts of a document worth showing the extractor: a window of text
 * around every email address and phone number, overlapping windows merged,
 * capped at `maxChars`. Each window is a verbatim substring of `text`, so
 * whatever is extracted from it can be checked against the document.
 */
export function contactWindows(
  text: string,
  { radius = 300, maxChars = 6000 }: { radius?: number; maxChars?: number } = {}
): string[] {
  const spans: [number, number][] = [];
  for (const re of [EMAIL_IN_TEXT_RE, PHONE_IN_TEXT_RE]) {
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0;
      spans.push([Math.max(0, at - radius), Math.min(text.length, at + m[0].length + radius)]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }

  const out: string[] = [];
  let used = 0;
  for (const [start, end] of merged) {
    if (used >= maxChars) break;
    const piece = text.slice(start, Math.min(end, start + (maxChars - used)));
    out.push(piece);
    used += piece.length;
  }
  return out;
}
