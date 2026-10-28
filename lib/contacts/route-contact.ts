import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { TEXT_MODEL_ID } from "@/lib/ai/models";
import { z } from "zod";
import { reportAiFailure } from "@/lib/alerts/ai-failure-alert";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONTACT_TOPICS,
  CONTACT_TOPIC_LABELS,
  detectDivision,
  formatContactDirectory,
  hasSpecialistContacts,
  isMissingTableError,
  isContactTopic,
  selectContact,
  type ContactCardData,
  type ContactTopic,
  type SchoolContact,
} from "./directory";

// Server side of contact routing for the chat's unanswered path: load the
// school's approved contacts, classify the question to a topic, pick one.
// Everything here fails soft — any error (including migration 044 not being
// applied) means "no contact", and the chat answers exactly as before.

const CLASSIFY_TIMEOUT_MS = 4000;

type ApprovedContact = Pick<
  SchoolContact,
  "id" | "name" | "role" | "email" | "phone" | "division_id" | "topics" | "status"
>;

/** The school's approved contacts; [] when there are none or the table is missing. */
export async function loadApprovedContacts(
  supabase: SupabaseClient,
  schoolId: string
): Promise<ApprovedContact[]> {
  try {
    const { data, error } = await supabase
      .from("school_contacts")
      .select("id, name, role, email, phone, division_id, topics, status")
      .eq("school_id", schoolId)
      .eq("status", "approved")
      .order("created_at", { ascending: true });
    if (error) {
      if (!isMissingTableError(error)) {
        console.error("[contacts] Loading approved contacts failed:", error.message);
      }
      return [];
    }
    return (data ?? []).map((c) => ({ ...c, topics: c.topics ?? [] }));
  } catch (err) {
    console.error("[contacts] Loading approved contacts failed:", err);
    return [];
  }
}

const NOT_SCHOOL = "not_school_related";

const classifySchema = z.object({
  topic: z.enum([...CONTACT_TOPICS, NOT_SCHOOL]),
});

/**
 * One cheap Gemini call mapping the question onto the fixed topic list.
 * `question` must already be the provider-safe (child-name-redacted) text.
 * Returns null on failure or timeout (→ main office), and "not_school" when
 * the question isn't about the school at all (→ no card).
 */
export async function classifyContactTopic(
  question: string
): Promise<ContactTopic | "not_school" | null> {
  const topicList = CONTACT_TOPICS.map((t) => `- ${t}: ${CONTACT_TOPIC_LABELS[t]}`).join("\n");
  try {
    const { object } = await generateObject({
      model: google(TEXT_MODEL_ID),
      schema: classifySchema,
      temperature: 0,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      prompt: `A parent asked their child's school assistant the question below. Which school staff department should handle it?

Topics:
${topicList}
- ${NOT_SCHOOL}: not about the school at all

Use main_office for general school questions that fit no other topic.

Question: ${question.slice(0, 500)}`,
    });
    if (object.topic === NOT_SCHOOL) return "not_school";
    return isContactTopic(object.topic) ? object.topic : null;
  } catch (err) {
    reportAiFailure(err, { source: "chat.contact-topic" });
    return null;
  }
}

/**
 * The contact card for an unanswered question, or null for "no card".
 * `contacts` are the school's approved rows (loadApprovedContacts).
 */
export async function routeUnansweredQuestion({
  supabase,
  schoolId,
  contacts,
  providerQuestion,
  divisionHints,
}: {
  supabase: SupabaseClient;
  schoolId: string;
  contacts: ApprovedContact[];
  /** The redacted question — the only text sent to the provider. */
  providerQuestion: string;
  /** Text searched for a division name (the question and its rewrite). */
  divisionHints: string[];
}): Promise<{ card: ContactCardData; topic: ContactTopic | null } | null> {
  if (contacts.length === 0) return null;

  // Only main-office contacts: no topic can change the answer, so skip the call.
  const classified = hasSpecialistContacts(contacts)
    ? await classifyContactTopic(providerQuestion)
    : null;
  if (classified === "not_school") return null;

  const divisions = await loadDivisions(supabase, schoolId);
  const divisionId =
    divisionHints.map((h) => detectDivision(h, divisions)).find(Boolean) ?? null;

  const selection = selectContact(contacts, { topic: classified, divisionId });
  if (!selection) return null;
  const c = selection.contact;
  return {
    topic: classified,
    card: {
      id: c.id,
      name: c.name,
      role: c.role,
      email: c.email?.trim() || null,
      phone: c.phone?.trim() || null,
      division: divisions.find((d) => d.id === c.division_id)?.name ?? null,
    },
  };
}

async function loadDivisions(
  supabase: SupabaseClient,
  schoolId: string
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("event_calendars")
    .select("id, name")
    .eq("school_id", schoolId)
    .eq("kind", "division");
  if (error) {
    console.error("[contacts] Loading divisions failed:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * The approved directory for the answer prompt (formatContactDirectory), with
 * division names when any contact belongs to a division. Never rejects: any
 * failure, no contacts, or no table yet is "" (the prompt is unchanged).
 */
export async function contactDirectoryPrompt(
  supabase: SupabaseClient,
  schoolId: string,
  contacts: ApprovedContact[]
): Promise<string> {
  try {
    if (contacts.length === 0) return "";
    const divisions = contacts.some((c) => c.division_id)
      ? await loadDivisions(supabase, schoolId)
      : [];
    return formatContactDirectory(contacts, divisions);
  } catch (err) {
    console.error("[contacts] Building the contact directory failed:", err);
    return "";
  }
}

/**
 * Appended to the system prompt when a card is shown. The model points to the
 * card rather than to "the school office", and never writes contact details
 * itself — the card's details come only from the approved row.
 */
export function contactCardPrompt(card: ContactCardData): string {
  const who = [card.role, card.name].filter(Boolean).join(", ");
  const division = card.division ? ` (${card.division})` : "";
  return `CONTACT CARD
Below your answer the parent will see a contact card for ${who}${division}, with buttons to email or call. This replaces the instruction to suggest the school office: after saying you couldn't find the answer, tell them they can reach ${card.role || card.name || "the right person"} using the contact card below. Do not write any email address or phone number yourself — the card shows them.`;
}
