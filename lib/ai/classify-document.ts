import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

const CONTENT_MAX_CHARS = 6000;

export interface ClassifyOption {
  id: string;
  name: string;
}

export interface ClassifyInput {
  title: string;
  /** Summary or leading content of the document. */
  content: string;
  categories: ClassifyOption[];
  folders: ClassifyOption[];
}

export interface ClassifyResult {
  categoryId: string | null;
  folderId: string | null;
}

const ClassificationSchema = z.object({
  categoryName: z
    .string()
    .nullable()
    .describe("Exact name of the best-fit category from the list, or null if none fit"),
  folderName: z
    .string()
    .nullable()
    .describe("Exact name of the best-fit folder from the list, or null if none fit"),
});

function optionBlock(label: string, options: ClassifyOption[]): string {
  if (!options.length) return `${label}: (none defined)`;
  return `${label}: ${options.map((o) => `"${o.name}"`).join(", ")}`;
}

/** Case-insensitive name -> id resolution; returns null if no exact-ish match. */
function resolveId(
  name: string | null,
  options: ClassifyOption[]
): string | null {
  if (!name) return null;
  const target = name.trim().toLowerCase();
  const match = options.find((o) => o.name.trim().toLowerCase() === target);
  return match ? match.id : null;
}

/**
 * Pick the best-fit category and folder for a document from the school's
 * existing lists. Never invents new categories/folders — returns null when
 * nothing fits or when the school has none defined.
 */
export async function classifyDocument(
  input: ClassifyInput
): Promise<ClassifyResult> {
  if (!input.categories.length && !input.folders.length) {
    return { categoryId: null, folderId: null };
  }

  const trimmed =
    input.content.length > CONTENT_MAX_CHARS
      ? input.content.slice(0, CONTENT_MAX_CHARS) + "..."
      : input.content;

  const { object } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: ClassificationSchema,
    system: `You file a school document into the correct category and folder.

Rules:
- Choose ONLY from the provided lists. Use the EXACT name as written, or null.
- Never invent a category or folder that is not listed.
- If no option is a clear fit, return null for that field. Do not guess.
- Judge from the document's actual subject matter, not just keywords.`,
    prompt: `${optionBlock("Categories", input.categories)}
${optionBlock("Folders", input.folders)}

--- DOCUMENT ---
Title: ${input.title}

${trimmed}
--- END ---

Return the best-fit category and folder (exact names, or null).`,
    temperature: 0.1,
    maxOutputTokens: 200,
    maxRetries: 2,
  });

  return {
    categoryId: resolveId(object.categoryName, input.categories),
    folderId: resolveId(object.folderName, input.folders),
  };
}
