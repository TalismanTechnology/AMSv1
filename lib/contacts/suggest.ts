import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDocumentText } from "@/lib/documents/get-document-text";
import {
  CONTACT_TOPICS,
  CONTACT_TOPIC_LABELS,
  CONTACTS_TABLE_MISSING_MESSAGE,
  contactWindows,
  dedupeContacts,
  isMissingTableError,
  verifyExtractedContact,
  type ExtractedContact,
} from "./directory";
import { reportAiFailure } from "@/lib/alerts/ai-failure-alert";

// "Suggest contacts from documents": read the school's ready documents, ask
// Gemini for the staff contacts they list, keep only those whose email or
// phone appears verbatim in the document, drop ones already in the directory,
// and (when writing) insert them as status = 'suggested' for an admin to
// review. Shared by the admin server action and scripts/suggest-contacts.ts.

// Volume caps: documents read, text per document sent, and per Gemini call.
const MAX_DOCUMENTS = 80;
const MAX_CHARS_PER_DOCUMENT = 6000;
const MAX_CHARS_PER_CALL = 40_000;
const MAX_CALLS = 6;
const EXCERPT_RADIUS = 160;

export interface SuggestedContact extends ExtractedContact {
  source_document_id: string;
  document_title: string;
}

export interface SuggestContactsResult {
  documentsScanned: number;
  /** Verified contacts before de-duplication. */
  found: number;
  suggestions: SuggestedContact[];
  inserted: number;
  error?: string;
}

interface DocRow {
  id: string;
  school_id: string;
  title: string | null;
  summary: string | null;
  text_url: string | null;
}

interface DocText {
  doc: DocRow;
  /** Title, summary and full text — what extracted details are checked against. */
  fullText: string;
  windows: string[];
}

const extractionSchema = z.object({
  contacts: z.array(
    z.object({
      doc: z.number().describe("The [Doc N] number the contact was found in"),
      name: z.string().describe("Person's name exactly as written, or empty if only a role/office is given"),
      role: z.string().describe("Job title or office, e.g. 'School Nurse', 'Transportation Office'"),
      email: z.string().nullable().describe("Email copied character for character, or null"),
      phone: z.string().nullable().describe("Phone copied character for character, or null"),
      topics: z.array(z.enum(CONTACT_TOPICS)),
      excerpt: z.string().describe("The sentence or line the contact appears in, copied exactly"),
    })
  ),
});

// Documents most likely to be directories or handbooks are read first.
const LIKELY_CONTACT_DOC = /contact|directory|staff|faculty|handbook|who to|office|department|nurse|transport|bus|athletic|admission|billing|tuition/i;

export async function suggestContactsFromDocuments(
  supabase: SupabaseClient,
  schoolId: string,
  { write }: { write: boolean }
): Promise<SuggestContactsResult> {
  const empty: SuggestContactsResult = { documentsScanned: 0, found: 0, suggestions: [], inserted: 0 };

  const { data: existing, error: existingError } = await supabase
    .from("school_contacts")
    .select("name, email, phone")
    .eq("school_id", schoolId);
  if (existingError) {
    return {
      ...empty,
      error: isMissingTableError(existingError) ? CONTACTS_TABLE_MISSING_MESSAGE : existingError.message,
    };
  }

  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("id, school_id, title, summary, text_url")
    .eq("school_id", schoolId)
    .eq("status", "ready")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (docsError) return { ...empty, error: docsError.message };

  const ranked = [...((docs ?? []) as DocRow[])]
    .map((d, i) => ({ d, i, likely: LIKELY_CONTACT_DOC.test(`${d.title ?? ""} ${d.summary ?? ""}`) }))
    .sort((a, b) => Number(b.likely) - Number(a.likely) || a.i - b.i)
    .slice(0, MAX_DOCUMENTS)
    .map(({ d }) => d);

  const texts: DocText[] = [];
  for (let i = 0; i < ranked.length; i += 8) {
    const batch = await Promise.all(
      ranked.slice(i, i + 8).map(async (doc): Promise<DocText | null> => {
        let body = "";
        try {
          body = await getDocumentText(supabase as unknown as Parameters<typeof getDocumentText>[0], doc);
        } catch (err) {
          console.error(`[contacts] Reading document ${doc.id} failed:`, err);
        }
        const fullText = [doc.title, doc.summary, body].filter(Boolean).join("\n\n");
        const windows = contactWindows(fullText, { maxChars: MAX_CHARS_PER_DOCUMENT });
        return windows.length > 0 ? { doc, fullText, windows } : null;
      })
    );
    texts.push(...batch.filter((t): t is DocText => t !== null));
  }

  // Pack documents into calls of up to MAX_CHARS_PER_CALL characters.
  const calls: DocText[][] = [];
  let current: DocText[] = [];
  let size = 0;
  for (const t of texts) {
    const length = t.windows.reduce((n, w) => n + w.length, 0);
    if (current.length > 0 && size + length > MAX_CHARS_PER_CALL) {
      calls.push(current);
      current = [];
      size = 0;
    }
    current.push(t);
    size += length;
  }
  if (current.length > 0) calls.push(current);

  const verified: SuggestedContact[] = [];
  const groups = calls.slice(0, MAX_CALLS);
  const extracted = await Promise.all(groups.map(extractContacts));
  for (const [g, group] of groups.entries()) {
    for (const contact of extracted[g]) {
      const source = group[contact.doc - 1];
      if (!source) continue;
      const checked = verifyExtractedContact(contact, source.fullText);
      if (!checked) continue;
      verified.push({
        ...checked,
        excerpt: checked.excerpt ?? excerptAround(source.fullText, checked.email ?? checked.phone ?? ""),
        source_document_id: source.doc.id,
        document_title: source.doc.title ?? "Untitled",
      });
    }
  }

  const suggestions = dedupeContacts(verified, existing ?? []);
  const result: SuggestContactsResult = {
    documentsScanned: texts.length,
    found: verified.length,
    suggestions,
    inserted: 0,
  };
  if (!write || suggestions.length === 0) return result;

  const { error: insertError, count } = await supabase.from("school_contacts").insert(
    suggestions.map((s) => ({
      school_id: schoolId,
      name: s.name,
      role: s.role,
      email: s.email,
      phone: s.phone,
      topics: s.topics,
      status: "suggested",
      source: "document",
      source_document_id: s.source_document_id,
      source_excerpt: s.excerpt,
    })),
    { count: "exact" }
  );
  if (insertError) return { ...result, error: insertError.message };
  return { ...result, inserted: count ?? suggestions.length };
}

async function extractContacts(
  group: DocText[]
): Promise<(ExtractedContact & { doc: number })[]> {
  const topics = CONTACT_TOPICS.map((t) => `- ${t}: ${CONTACT_TOPIC_LABELS[t]}`).join("\n");
  const body = group
    .map((t, i) => `[Doc ${i + 1}] ${t.doc.title ?? "Untitled"}\n${t.windows.join("\n…\n")}`)
    .join("\n\n=====\n\n");
  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: extractionSchema,
      temperature: 0,
      maxRetries: 2,
      prompt: `These are excerpts from a school's documents. List the school staff members and offices that parents could contact, with their email and/or phone.

Rules:
- Only contacts that literally appear in the text. Copy every email and phone number exactly as written, character for character. Never guess, complete, or reformat one.
- Skip students, parents, outside businesses, and generic website or social media addresses.
- Each contact needs an email or a phone number from the text.
- topics: which of these the person handles (main_office for a front desk / reception / general school office):
${topics}

${body}`,
    });
    return object.contacts;
  } catch (err) {
    reportAiFailure(err, { source: "contacts.extract" });
    return [];
  }
}

function excerptAround(text: string, needle: string): string | null {
  const at = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (at < 0) return null;
  const start = Math.max(0, at - EXCERPT_RADIUS);
  const end = Math.min(text.length, at + needle.length + EXCERPT_RADIUS);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}
