import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  emailBodyText,
  isIngestibleAttachment,
  type InboundAttachment,
  type InboundContent,
} from "@/lib/email/inbound-content";

// Content-level duplicate check for inbound mail, shared by the Resend
// webhook and manual submissions. The Message-ID claim only catches mail this
// pipeline ingested under the same id; this catches the same email arriving
// by another route (a native copy of mail the Gmail routine already added, a
// resend under a new Message-ID).
//
// It must never drop new content: recurring newsletters and digests share
// most of their text from week to week. So a body is a duplicate of an
// existing email document only when:
//   - its normalized text hashes the same (bodyHash: lowercase, no URLs,
//     addresses, tracking/unsubscribe/view-online/footer lines, punctuation);
//   - its subject is identical (subjectKey: case, whitespace and punctuation
//     only, so "Reminder: X" is not "X") and the text overlaps almost
//     entirely (word 5-gram Jaccard >= 0.9, or >= 0.95 of it already there);
//     or
//   - its subject is identical and it was sent the same day (both known).
// Different subjects with overlapping text ("Weekly Digest - October 15" and
// "- October 22") are always new. An attachment is a duplicate only of a
// document with the same normalized title or file name AND the same bytes.
//
// Candidates are bounded: email documents created or dated within 60 days of
// the message, plus any with the same subject words. A stored text that
// can't be read counts as no match.

export interface ExistingDoc {
  id: string;
  title: string | null;
  file_name: string | null;
  file_url?: string | null;
  created_at?: string | null;
  email_meta: {
    subject?: string | null;
    date?: string | null;
    body_hash_v1?: string | null;
  } | null;
}

export interface DuplicateMatch {
  documentId: string;
  title: string;
  why: string;
}

export interface ContentDuplicates {
  /** Null when the body is new, or there is no body text. */
  body: DuplicateMatch | null;
  /** One entry per ingestible attachment, in order. */
  attachments: { filename: string; match: DuplicateMatch | null }[];
}

type Db = Pick<ReturnType<typeof createAdminClient>, "from" | "storage">;

const DOC_FIELDS = "id, title, file_name, file_url, created_at, email_meta";
const WINDOW_MS = 60 * 24 * 3600 * 1000;
const MAX_CANDIDATES = 300;
const MAX_DOWNLOADS = 150;
const DOWNLOAD_CONCURRENCY = 8;

export const JACCARD_MIN = 0.9;
export const CONTAINMENT_MIN = 0.95;

/** Lowercase, no Re:/Fwd: prefix or document extension, punctuation as spaces. For file names. */
export function normalizeTitle(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/^(re|fw|fwd):\s*/i, "")
    .replace(/\.(pdf|txt|docx?)$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A subject as compared for "same subject": case, whitespace and punctuation
 * only. Prefixes are kept, so "Reminder: X" and "Fwd: X" are not "X".
 */
export function subjectKey(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Lines that differ per copy or per recipient rather than carrying content. */
const NOISE_LINE =
  /unsubscribe|view (this|it )?(email |message )?(online|in (your|a) browser)|having trouble viewing|click here to view|update your (email )?preferences|manage (your )?(subscription|preferences)|this email was sent to|sent to .+@|you are receiving this|you received this|no longer wish to receive|recipient list|privacy policy|powered by|forward to a friend/i;

/**
 * The words of a body, as compared: no URLs, email addresses or noise lines,
 * lowercase, punctuation dropped.
 */
export function bodyWords(text: string): string[] {
  return text
    .split(/\r?\n/)
    // Long lines are content that happens to mention one (a body with no line breaks).
    .filter((line) => line.length > 300 || !NOISE_LINE.test(line))
    .join("\n")
    .replace(/<?\b(https?:\/\/|www\.)[^\s<>]+>?/gi, " ")
    .replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

/** SHA-256 of the normalized body; null when too little is left to compare. */
export function bodyHash(text: string): string | null {
  const normalized = bodyWords(text).join(" ");
  if (normalized.length < 20) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function shingles(words: string[], n = 5): Set<string> {
  const k = Math.min(n, words.length);
  const out = new Set<string>();
  for (let i = 0; i + k <= words.length && k > 0; i++) out.add(words.slice(i, i + k).join(" "));
  return out;
}

/** Jaccard of the two bodies' word 5-grams, and how much of `text` is already in `existing`. */
export function bodyOverlap(text: string, existing: string): { jaccard: number; containment: number } {
  const a = shingles(bodyWords(text));
  const b = shingles(bodyWords(existing));
  if (!a.size || !b.size) return { jaccard: 0, containment: 0 };
  let shared = 0;
  for (const s of a) if (b.has(s)) shared++;
  return { jaccard: shared / (a.size + b.size - shared), containment: shared / a.size };
}

const day = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const docTitle = (d: ExistingDoc) => d.title ?? "?";

/** An existing email document, with its stored body text when it could be read. */
export interface BodyCandidate {
  doc: ExistingDoc;
  text: string | null;
}

/**
 * The body rules, on candidates already loaded. Pure: the hash, then same
 * subject + near-total overlap, then same subject + same day.
 */
export function matchBody(
  candidates: BodyCandidate[],
  email: { subject: string | null; date: string | null; text: string }
): DuplicateMatch | null {
  const hash = bodyHash(email.text);
  if (hash) {
    for (const { doc, text } of candidates) {
      const stored = doc.email_meta?.body_hash_v1 ?? (text != null ? bodyHash(text) : null);
      if (stored === hash) {
        return { documentId: doc.id, title: docTitle(doc), why: "same body text" };
      }
    }
  }

  const subject = subjectKey(email.subject);
  if (!subject) return null;
  const sameSubject = candidates.filter(({ doc }) => subjectKey(doc.email_meta?.subject) === subject);

  for (const { doc, text } of sameSubject) {
    if (text == null) continue;
    const { jaccard, containment } = bodyOverlap(email.text, text);
    if (jaccard >= JACCARD_MIN || containment >= CONTAINMENT_MIN) {
      return {
        documentId: doc.id,
        title: docTitle(doc),
        why: `same subject, ${Math.round(Math.max(jaccard, containment) * 100)}% same text`,
      };
    }
  }

  const emailDay = day(email.date);
  if (emailDay) {
    const hit = sameSubject.find(({ doc }) => day(doc.email_meta?.date) === emailDay);
    if (hit) {
      return { documentId: hit.doc.id, title: docTitle(hit.doc), why: "same subject and date" };
    }
  }
  return null;
}

/** `%w1%w2%...%`: a subject's words in order. Words are letters/digits only. */
function wordsPattern(s: string): string | null {
  const words = s.split(" ").filter((w) => /^[a-z0-9]+$/.test(w));
  return words.length ? `%${words.join("%")}%` : null;
}

async function selectDocs(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<ExistingDoc[]> {
  const { data, error } = await query;
  if (error) throw new Error(`Duplicate check failed: ${error.message}`);
  return (data ?? []) as ExistingDoc[];
}

/**
 * The school's email documents that could hold this body: created or dated
 * within 60 days of it, or with the same subject words. Email bodies only
 * (they have email_meta); attachments are checked separately.
 */
export async function loadBodyCandidates(
  db: Db,
  schoolId: string,
  email: { subject: string | null; date: string | null }
): Promise<ExistingDoc[]> {
  const at = new Date(email.date ?? Date.now());
  const center = Number.isNaN(at.getTime()) ? Date.now() : at.getTime();
  const from = new Date(center - WINDOW_MS).toISOString();
  const to = new Date(center + WINDOW_MS).toISOString();
  const base = () =>
    db.from("documents").select(DOC_FIELDS).eq("school_id", schoolId).eq("source", "email");

  const pattern = wordsPattern(subjectKey(email.subject));
  const lists = await Promise.all([
    selectDocs(
      base().gte("created_at", from).lte("created_at", to).order("created_at", { ascending: false }).limit(MAX_CANDIDATES)
    ),
    selectDocs(
      base().gte("email_meta->>date", from).lte("email_meta->>date", to).limit(MAX_CANDIDATES)
    ),
    pattern ? selectDocs(base().ilike("email_meta->>subject", pattern).limit(50)) : Promise.resolve([]),
  ]);

  const seen = new Map<string, ExistingDoc>();
  for (const d of lists.flat()) if (d.email_meta && !seen.has(d.id)) seen.set(d.id, d);
  return [...seen.values()];
}

async function downloadText(db: Db, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await db.storage.from("documents").download(path);
    if (error || !data) return null;
    return await data.text();
  } catch {
    return null;
  }
}

async function downloadBytes(db: Db, path: string | null | undefined): Promise<Buffer | null> {
  if (!path) return null;
  try {
    const { data, error } = await db.storage.from("documents").download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/** Run `fn` over items, at most `limit` at a time. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

/**
 * Read the stored text of the candidates the rules need it for: same-subject
 * ones first (overlap), then the rest without a stored hash, nearest first.
 */
async function withStoredText(
  db: Db,
  docs: ExistingDoc[],
  email: { subject: string | null; date: string | null }
): Promise<BodyCandidate[]> {
  const subject = subjectKey(email.subject);
  const center = new Date(email.date ?? Date.now()).getTime() || Date.now();
  const distance = (d: ExistingDoc) =>
    Math.abs((new Date(d.email_meta?.date ?? d.created_at ?? 0).getTime() || 0) - center);
  const same = (d: ExistingDoc) => !!subject && subjectKey(d.email_meta?.subject) === subject;

  const needText = docs
    .filter((d) => same(d) || !d.email_meta?.body_hash_v1)
    .sort((a, b) => Number(same(b)) - Number(same(a)) || distance(a) - distance(b))
    .slice(0, MAX_DOWNLOADS);
  const texts = new Map<string, string | null>();
  await mapLimited(needText, DOWNLOAD_CONCURRENCY, async (d) => {
    texts.set(d.id, await downloadText(db, d.file_url));
  });
  return docs.map((doc) => ({ doc, text: texts.get(doc.id) ?? null }));
}

const sha256 = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

/**
 * An attachment is a duplicate of a document with the same normalized title
 * or file name whose stored file has the same bytes.
 */
export async function matchAttachment(
  db: Db,
  schoolId: string,
  att: Pick<InboundAttachment, "filename" | "load">
): Promise<DuplicateMatch | null> {
  const name = normalizeTitle(att.filename || "attachment");
  const pattern = wordsPattern(name);
  if (!pattern) return null;
  const docs = await selectDocs(
    db
      .from("documents")
      .select(DOC_FIELDS)
      .eq("school_id", schoolId)
      .or(`title.ilike.${pattern},file_name.ilike.${pattern}`)
      .limit(20)
  );
  const named = docs.filter(
    (d) => normalizeTitle(d.title) === name || normalizeTitle(d.file_name) === name
  );
  if (!named.length) return null;

  const bytes = await att.load();
  if (!bytes) return null;
  const hash = sha256(bytes);
  for (const d of named) {
    const stored = await downloadBytes(db, d.file_url);
    if (stored && sha256(stored) === hash) {
      return { documentId: d.id, title: docTitle(d), why: "same file name and content" };
    }
  }
  return null;
}

/**
 * Which parts of an email are already in the school's library. Reads only.
 * Throws if the documents can't be listed.
 */
export async function findContentDuplicates(
  params: { schoolId: string; subject: string | null; content: InboundContent },
  db: Db = createAdminClient()
): Promise<ContentDuplicates> {
  const { schoolId, content } = params;
  const bodyText = emailBodyText(content);
  const email = { subject: content.subject?.trim() || params.subject, date: content.date };

  let body: DuplicateMatch | null = null;
  if (bodyText) {
    const docs = await loadBodyCandidates(db, schoolId, email);
    body = matchBody(await withStoredText(db, docs, email), { ...email, text: bodyText });
  }

  const attachments: ContentDuplicates["attachments"] = [];
  for (const att of content.attachments.filter(isIngestibleAttachment)) {
    attachments.push({
      filename: att.filename || "attachment",
      match: await matchAttachment(db, schoolId, att),
    });
  }

  return { body, attachments };
}

/** "body" or the attachment's file name, then what it matched. */
export function describeDuplicates(
  matches: { part: string; match: DuplicateMatch }[]
): string {
  return matches
    .map(({ part, match }) => `${part} = "${match.title}" (${match.why})`)
    .join("; ");
}
