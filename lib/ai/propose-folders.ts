import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import {
  AUTO_FOLDER_MAX_FOLDERS,
  AUTO_FOLDER_MIN_FOLDERS,
  type AutoFolderProposal,
} from "@/lib/documents/auto-folder";

/** Characters of each summary shown to the model next to the title. */
const SNIPPET_CHARS = 160;
/** Documents per assignment call; keeps each answer well inside the budget. */
const ASSIGN_BATCH = 80;
const ASSIGN_CONCURRENCY = 4;

export interface ProposeFolderDoc {
  id: string;
  title: string;
  summary?: string | null;
}

export interface ProposeFoldersInput {
  docs: ProposeFolderDoc[];
  /** The school's root folders that may be reused (not Website/Responses). */
  existingFolders: { name: string; examples?: string[] }[];
}

const MODEL_OPTIONS = {
  temperature: 0.1,
  // As in classify-document: Gemini 2.5 charges thinking tokens against
  // maxOutputTokens, and a long list would otherwise come back cut short.
  providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
  maxRetries: 2,
} as const;

function docLine(doc: ProposeFolderDoc, n: number): string {
  const snippet = doc.summary?.replace(/\s+/g, " ").trim().slice(0, SNIPPET_CHARS);
  return `${n}. ${doc.title.replace(/\s+/g, " ").trim()}${snippet ? ` — ${snippet}` : ""}`;
}

function existingBlock(existing: ProposeFoldersInput["existingFolders"]): string {
  if (!existing.length) return "The library has no folders yet.";
  const lines = existing.map((f) => {
    const examples = (f.examples ?? []).slice(0, 3);
    return `- "${f.name}"${examples.length ? ` (already holds: ${examples.map((e) => `"${e}"`).join(", ")})` : ""}`;
  });
  return `Folders the library already has (reuse these names, spelled exactly, wherever they fit):\n${lines.join("\n")}`;
}

/** Step 1: the folder structure, from every document's title and gist. */
async function proposeStructure(
  input: ProposeFoldersInput,
  lines: string[]
): Promise<string[]> {
  const { object } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: z.object({
      folders: z
        .array(
          z.object({
            name: z.string().describe("Folder name, 1-5 words, Title Case."),
            purpose: z.string().describe("One short line: what goes in it."),
          })
        )
        .describe(`${AUTO_FOLDER_MIN_FOLDERS}-${AUTO_FOLDER_MAX_FOLDERS} top-level folders.`),
    }),
    system: `You organise a school's document library into top-level folders that parents' questions map onto naturally.

Rules:
- Propose ${AUTO_FOLDER_MIN_FOLDERS}-${AUTO_FOLDER_MAX_FOLDERS} top-level folders (fewer only if there are very few documents). No subfolders.
- Reuse an existing folder name, spelled exactly, whenever it fits. Only invent a new folder when none of the existing ones fits a real group of documents.
- Names are short (1-5 words), Title Case, and describe a subject ("Athletics", "Health & Safety", "Tuition & Financial Aid"), never a date, a person, or a single document.
- Never propose "Website" or "Responses"; those are reserved.
- Every document should have an obvious home; avoid a catch-all unless a handful truly fit nowhere ("General Information").`,
    prompt: `${existingBlock(input.existingFolders)}

Documents:
${lines.join("\n")}

Propose the folders.`,
    maxOutputTokens: 1500,
    ...MODEL_OPTIONS,
  });
  return object.folders.map((f) => f.name);
}

/** Step 2: each document into one of the proposed folders. */
async function assignBatch(
  folders: string[],
  batch: { n: number; line: string }[]
): Promise<{ n: number; folder: string }[]> {
  const { object } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: z.object({
      assignments: z.array(
        z.object({
          n: z.number().int().describe("The document's number."),
          folder: z.enum(folders as [string, ...string[]]),
        })
      ),
    }),
    system: `You file each school document into exactly one of the given folders.

Rules:
- Use only the folder names given, spelled exactly.
- Judge by what the document is about, not by keywords.
- Return one entry per document, using its number.`,
    prompt: `Folders:
${folders.map((f) => `- "${f}"`).join("\n")}

Documents:
${batch.map((b) => b.line).join("\n")}`,
    maxOutputTokens: 40 * batch.length + 200,
    ...MODEL_OPTIONS,
  });
  return object.assignments;
}

/**
 * Ask the model for a folder structure for these documents and where each
 * goes. The answer is a raw proposal: run it through
 * sanitizeAutoFolderProposal before showing or applying it. Throws if a model
 * call fails.
 */
export async function proposeFolders(
  input: ProposeFoldersInput
): Promise<AutoFolderProposal> {
  if (!input.docs.length) return { assignments: [] };

  const numbered = input.docs.map((doc, i) => ({ doc, n: i + 1, line: docLine(doc, i + 1) }));
  const names = [
    ...new Map(
      (await proposeStructure(input, numbered.map((d) => d.line)))
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => [name.toLowerCase(), name] as const)
    ).values(),
  ];
  if (!names.length) return { assignments: [] };

  const batches: (typeof numbered)[] = [];
  for (let i = 0; i < numbered.length; i += ASSIGN_BATCH) {
    batches.push(numbered.slice(i, i + ASSIGN_BATCH));
  }

  const byNumber = new Map(numbered.map((d) => [d.n, d.doc.id]));
  const assignments: AutoFolderProposal["assignments"] = [];
  for (let i = 0; i < batches.length; i += ASSIGN_CONCURRENCY) {
    const answers = await Promise.all(
      batches.slice(i, i + ASSIGN_CONCURRENCY).map(async (batch) => {
        const allowed = new Set(batch.map((b) => b.n));
        // A number outside the batch would be a guess at another document.
        return (await assignBatch(names, batch)).filter((a) => allowed.has(a.n));
      })
    );
    for (const a of answers.flat()) {
      const documentId = byNumber.get(a.n);
      if (documentId) assignments.push({ documentId, folder: a.folder });
    }
  }
  return { assignments };
}
