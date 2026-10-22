import { createAdminClient } from "@/lib/supabase/admin";
import {
  emailBodyText,
  isIngestibleAttachment,
  type InboundContent,
} from "@/lib/email/inbound-content";

// Content-level duplicate check for inbound mail. The Message-ID claim only
// catches mail this pipeline ingested before; this catches the same email (or
// attachment) already in the school's library by any route: an earlier direct
// import with no email_ingestions row, a manual upload, the same newsletter
// saved as a PDF under another title.
//
// A body is a duplicate of an existing document when:
//   - its email_meta has the same normalized subject and the same day (or
//     either date is unknown);
//   - its title or file name is the normalized subject, unless it is itself an
//     email from a different day (a recurring subject like "Weekly Update" is
//     a new email each week); or
//   - two distinctive runs of the body's words are both already indexed in
//     one document's chunks (catches it saved as a PDF under another title).
// An attachment is a duplicate when a document's title or file name is its
// normalized file name.

export interface ExistingDoc {
  id: string;
  title: string | null;
  file_name: string | null;
  email_meta: { subject?: string | null; date?: string | null } | null;
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

type Db = Pick<ReturnType<typeof createAdminClient>, "from">;

/** Lowercase, no Re:/Fwd: prefix or document extension, punctuation as spaces. */
export function normalizeTitle(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/^(re|fw|fwd):\s*/i, "")
    .replace(/\.(pdf|txt|docx?)$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

/** The metadata half of the body check (subject/date, title). */
export function matchBodyByMeta(
  docs: ExistingDoc[],
  email: { subject: string | null; date: string | null }
): DuplicateMatch | null {
  const subject = normalizeTitle(email.subject);
  if (!subject) return null;
  const emailDay = day(email.date);

  for (const d of docs) {
    const metaDay = day(d.email_meta?.date);
    if (
      d.email_meta?.subject &&
      normalizeTitle(d.email_meta.subject) === subject &&
      (!emailDay || !metaDay || metaDay === emailDay)
    ) {
      return { documentId: d.id, title: d.title ?? "?", why: "same email subject and date" };
    }
  }
  for (const d of docs) {
    const metaDay = day(d.email_meta?.date);
    if (emailDay && metaDay && metaDay !== emailDay) continue;
    if (normalizeTitle(d.title) === subject || normalizeTitle(d.file_name) === subject) {
      return { documentId: d.id, title: d.title ?? "?", why: "same title" };
    }
  }
  return null;
}

export function matchAttachment(docs: ExistingDoc[], filename: string): DuplicateMatch | null {
  const name = normalizeTitle(filename);
  if (!name) return null;
  const hit = docs.find(
    (d) => normalizeTitle(d.title) === name || normalizeTitle(d.file_name) === name
  );
  return hit ? { documentId: hit.id, title: hit.title ?? "?", why: "same title" } : null;
}

/**
 * Two four-word runs from 30% and 60% into the body, for the chunk search.
 * Only words of 4+ letters, so the runs survive PDF extraction's spacing and
 * punctuation. Null for bodies too short to fingerprint reliably.
 */
export function bodyProbes(text: string): [string[], string[]] | null {
  const words = text
    .replace(/\s+/g, " ")
    .split(" ")
    .filter((w) => /^[A-Za-z]{4,}$/.test(w));
  if (words.length < 30) return null;
  const at = (f: number) => {
    const k = Math.floor(words.length * f);
    return words.slice(k, k + 4);
  };
  return [at(0.3), at(0.6)];
}

/** `%w1%w2%w3%w4%`: the words in order, anything between. Words are letters only. */
const probePattern = (words: string[]) => `%${words.join("%")}%`;

/** Every document of the school, paged (PostgREST caps a response at 1000 rows). */
export async function loadSchoolDocs(db: Db, schoolId: string): Promise<ExistingDoc[]> {
  const docs: ExistingDoc[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("documents")
      .select("id, title, file_name, email_meta")
      .eq("school_id", schoolId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Duplicate check failed: ${error.message}`);
    docs.push(...((data ?? []) as ExistingDoc[]));
    if (!data || data.length < PAGE) return docs;
  }
}

/**
 * The body's text already indexed: a document whose chunks match both probes.
 * A failed search is logged and treated as no match, so a slow chunk table
 * can't block ingestion (the metadata checks still ran).
 */
export async function matchBodyByChunks(
  db: Db,
  schoolId: string,
  bodyText: string,
  docs: ExistingDoc[]
): Promise<DuplicateMatch | null> {
  const probes = bodyProbes(bodyText);
  if (!probes) return null;
  try {
    for (const [i, probe] of probes.entries()) {
      const { data: hits, error } = await db
        .from("document_chunks")
        .select("document_id")
        .eq("school_id", schoolId)
        .ilike("content", probePattern(probe))
        .limit(5);
      if (error) throw new Error(error.message);
      const ids = [...new Set((hits ?? []).map((h) => h.document_id as string))];
      if (!ids.length) continue;
      // The other probe has to agree, in one of the same documents.
      const other = probes[1 - i];
      const { data: confirmed, error: confirmError } = await db
        .from("document_chunks")
        .select("document_id")
        .in("document_id", ids)
        .ilike("content", probePattern(other))
        .limit(1);
      if (confirmError) throw new Error(confirmError.message);
      const id = confirmed?.[0]?.document_id as string | undefined;
      if (id) {
        const title = docs.find((d) => d.id === id)?.title ?? "?";
        return { documentId: id, title, why: "same body text already indexed" };
      }
    }
  } catch (err) {
    console.warn("[inbound-email] Body text duplicate search failed:", err);
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
  const docs = await loadSchoolDocs(db, schoolId);
  const bodyText = emailBodyText(content);

  let body: DuplicateMatch | null = null;
  if (bodyText) {
    body =
      matchBodyByMeta(docs, {
        subject: content.subject?.trim() || params.subject,
        date: content.date,
      }) ?? (await matchBodyByChunks(db, schoolId, bodyText, docs));
  }

  const attachments = content.attachments.filter(isIngestibleAttachment).map((att) => {
    const filename = att.filename || "attachment";
    return { filename, match: matchAttachment(docs, filename) };
  });

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
