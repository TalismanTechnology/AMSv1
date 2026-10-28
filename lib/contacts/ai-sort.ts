// AI sort for the admin Contacts page: the model proposes a set of contact
// folders (reusing the school's existing ones where they fit) and a folder
// for each contact; sanitizeContactSortProposal turns that into a plan that is
// safe to show and apply. Only names, roles, topics and divisions go to the
// model — never email addresses or phone numbers. The model call is injected
// (`generate`) so the prompt and parsing are unit tested (ai-sort.test.ts).

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { TEXT_MODEL_ID } from "@/lib/ai/models";
import { CONTACT_TOPIC_LABELS, isContactTopic } from "./directory";
import { cleanContactFolderName, folderKey } from "./folders";

export const AI_SORT_MIN_FOLDERS = 3;
export const AI_SORT_MAX_FOLDERS = 10;
/** Contacts per run; a directory larger than this is sorted in several runs. */
export const AI_SORT_MAX_CONTACTS = 200;

export interface AiSortContact {
  id: string;
  name: string;
  role: string;
  topics: readonly string[];
  /** The division's name, when the contact belongs to one. */
  division?: string | null;
  folder_id?: string | null;
}

export interface AiSortFolder {
  id: string;
  name: string;
}

/** The model's raw answer, by contact id. */
export interface AiSortProposal {
  assignments: { contactId: string; folder: string }[];
}

export interface AiSortMove {
  contactId: string;
  /** Name, or role when there's no name. */
  label: string;
  fromFolderId: string | null;
  folder: string;
}

export interface AiSortTarget {
  name: string;
  existingId: string | null;
  count: number;
}

export interface AiSortPlan {
  folders: AiSortTarget[];
  moves: AiSortMove[];
  skipped: { contactId: string; reason: string }[];
}

const MODEL_OPTIONS = {
  temperature: 0.1,
  // As in propose-folders: Gemini's thinking models charge thinking tokens
  // against maxOutputTokens, and a long list would otherwise come back cut short.
  providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
  maxRetries: 2,
} as const;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** "3. Jane Smith — School Nurse | Lower School | Health & nurse" */
export function contactLine(contact: AiSortContact, n: number): string {
  const who = [oneLine(contact.name), oneLine(contact.role)].filter(Boolean).join(" — ");
  const topics = contact.topics.filter(isContactTopic).map((t) => CONTACT_TOPIC_LABELS[t]);
  const parts = [
    who || "(unnamed)",
    contact.division ? `Division: ${oneLine(contact.division)}` : "",
    topics.length ? `Topics: ${topics.join(", ")}` : "",
  ].filter(Boolean);
  return `${n}. ${parts.join(" | ")}`;
}

export const AI_SORT_SYSTEM = `You organise a school's staff contact directory into folders that parents browse to find who to contact.

Rules:
- Propose ${AI_SORT_MIN_FOLDERS}-${AI_SORT_MAX_FOLDERS} folders (fewer only if there are very few contacts). No subfolders.
- Reuse an existing folder name, spelled exactly, whenever it fits. Only invent a new folder when none of the existing ones fits a real group of contacts.
- Names are short (1-4 words), Title Case, and name a department or office parents recognise ("Admissions", "Athletics", "Health Services", "Business Office", "Lower School Office"), never a person.
- When contacts belong to divisions (Lower, Middle, Upper School), a folder per division office is good for division heads, assistants and deans; specialists (nurse, athletics, admissions, billing) go in their department's folder.
- Put each contact in exactly one folder, using its number. Every contact gets a folder.`;

export function buildAiSortPrompt(
  contacts: readonly AiSortContact[],
  existingFolders: readonly AiSortFolder[]
): string {
  const existing = existingFolders.length
    ? `Folders the directory already has (reuse these names, spelled exactly, wherever they fit):\n${existingFolders
        .map((f) => `- "${oneLine(f.name)}"`)
        .join("\n")}`
    : "The directory has no folders yet.";
  return `${existing}

Contacts:
${contacts.map((c, i) => contactLine(c, i + 1)).join("\n")}

Propose the folders and put every contact in one.`;
}

export const aiSortSchema = z.object({
  folders: z
    .array(z.string().describe("Folder name, 1-4 words, Title Case."))
    .describe(`${AI_SORT_MIN_FOLDERS}-${AI_SORT_MAX_FOLDERS} folders.`),
  assignments: z.array(
    z.object({
      n: z.number().int().describe("The contact's number."),
      folder: z.string().describe("One of the folder names above, spelled exactly."),
    })
  ),
});

export type AiSortModelAnswer = z.infer<typeof aiSortSchema>;

/** The model call, injectable for tests. */
export type AiSortGenerate = (args: {
  system: string;
  prompt: string;
  maxOutputTokens: number;
}) => Promise<AiSortModelAnswer>;

const defaultGenerate: AiSortGenerate = async ({ system, prompt, maxOutputTokens }) => {
  const { object } = await generateObject({
    model: google(TEXT_MODEL_ID),
    schema: aiSortSchema,
    system,
    prompt,
    maxOutputTokens,
    ...MODEL_OPTIONS,
  });
  return object;
};

/**
 * Map the model's numbered answer back to contact ids. Numbers outside the
 * list and folders the model didn't list are dropped (a folder named only in
 * an assignment is accepted when the folder list was empty).
 */
export function parseAiSortAnswer(
  answer: AiSortModelAnswer,
  contacts: readonly Pick<AiSortContact, "id">[]
): AiSortProposal {
  const listed = new Set((answer.folders ?? []).map(folderKey).filter(Boolean));
  const assignments: AiSortProposal["assignments"] = [];
  for (const a of answer.assignments ?? []) {
    const contact = Number.isInteger(a?.n) ? contacts[a.n - 1] : undefined;
    if (!contact) continue;
    const folder = cleanContactFolderName(a.folder);
    if (!folder) continue;
    if (listed.size && !listed.has(folderKey(folder))) continue;
    assignments.push({ contactId: contact.id, folder });
  }
  return { assignments };
}

/**
 * Ask the model for folders and an assignment per contact. A raw proposal:
 * run it through sanitizeContactSortProposal before showing or applying it.
 * Throws if the model call fails.
 */
export async function proposeContactFolders(
  input: { contacts: readonly AiSortContact[]; existingFolders: readonly AiSortFolder[] },
  { generate = defaultGenerate }: { generate?: AiSortGenerate } = {}
): Promise<AiSortProposal> {
  const contacts = input.contacts.slice(0, AI_SORT_MAX_CONTACTS);
  if (!contacts.length) return { assignments: [] };
  const answer = await generate({
    system: AI_SORT_SYSTEM,
    prompt: buildAiSortPrompt(contacts, input.existingFolders),
    maxOutputTokens: 30 * contacts.length + 600,
  });
  return parseAiSortAnswer(answer, contacts);
}

/**
 * Turn a proposal (from the model, or sent back by the client on apply) into
 * a plan that only does what AI sort may:
 * - contacts must be in `contacts` (this school's, loaded server-side);
 *   unknown ids, repeats and moves into the folder a contact is already in
 *   are dropped;
 * - folder names are cleaned, de-duplicated ignoring case, and resolve to the
 *   school's existing folder of that name when there is one;
 * - at most `maxFolders` targets, keeping the most used.
 * Never deletes or renames folders and never changes a contact's status.
 */
export function sanitizeContactSortProposal(input: {
  contacts: readonly AiSortContact[];
  folders: readonly AiSortFolder[];
  proposal: AiSortProposal;
  maxFolders?: number;
}): AiSortPlan {
  const maxFolders = input.maxFolders ?? AI_SORT_MAX_FOLDERS;
  const contacts = new Map(input.contacts.map((c) => [c.id, c]));
  const existing = new Map<string, AiSortFolder>();
  for (const f of input.folders) if (!existing.has(folderKey(f.name))) existing.set(folderKey(f.name), f);

  const skipped: AiSortPlan["skipped"] = [];
  const seen = new Set<string>();
  const wanted: { contact: AiSortContact; key: string }[] = [];
  const displayName = new Map<string, string>();

  for (const a of input.proposal.assignments ?? []) {
    const contactId = String(a?.contactId ?? "");
    const contact = contacts.get(contactId);
    if (!contact) {
      skipped.push({ contactId, reason: "not a contact of this school" });
      continue;
    }
    if (seen.has(contactId)) {
      skipped.push({ contactId, reason: "assigned twice" });
      continue;
    }
    const name = cleanContactFolderName(a.folder);
    if (!name) {
      skipped.push({ contactId, reason: "no folder name" });
      continue;
    }
    seen.add(contactId);
    const k = folderKey(name);
    if (!displayName.has(k)) displayName.set(k, existing.get(k)?.name ?? name);
    wanted.push({ contact, key: k });
  }

  const counts = new Map<string, number>();
  for (const w of wanted) counts.set(w.key, (counts.get(w.key) ?? 0) + 1);
  const kept = new Set(
    [...counts.entries()]
      .sort(
        ([a, x], [b, y]) =>
          y - x || Number(existing.has(b)) - Number(existing.has(a)) || a.localeCompare(b)
      )
      .slice(0, Math.max(0, maxFolders))
      .map(([k]) => k)
  );

  const moves: AiSortMove[] = [];
  const used = new Map<string, number>();
  for (const { contact, key: k } of wanted) {
    if (!kept.has(k)) {
      skipped.push({ contactId: contact.id, reason: "too many folders proposed" });
      continue;
    }
    const target = existing.get(k);
    if (target && contact.folder_id === target.id) {
      skipped.push({ contactId: contact.id, reason: "already in that folder" });
      continue;
    }
    moves.push({
      contactId: contact.id,
      label: contact.name.trim() || contact.role.trim() || "Contact",
      fromFolderId: contact.folder_id ?? null,
      folder: displayName.get(k)!,
    });
    used.set(k, (used.get(k) ?? 0) + 1);
  }

  const folders: AiSortTarget[] = [...used.entries()]
    .map(([k, count]) => ({
      name: displayName.get(k)!,
      existingId: existing.get(k)?.id ?? null,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return { folders, moves, skipped };
}
