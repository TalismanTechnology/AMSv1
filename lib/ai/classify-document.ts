import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

const CONTENT_MAX_CHARS = 6000;
const MAX_EXAMPLES = 3;

/**
 * Returned when nothing fits. Kept as a member of the enum rather than making
 * the field nullable: a plain string enum is the structured-output shape Gemini
 * honours most reliably, and it means every response maps to a real option.
 */
const NO_FIT = "__NONE__";

export interface ClassifyOption {
  id: string;
  /** Label shown to the model. Must be unique within its list. */
  name: string;
  description?: string | null;
  /** Titles of documents already filed here, to ground what the label means. */
  examples?: string[];
}

export interface FolderNode {
  id: string;
  name: string;
  parent_id: string | null;
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

/**
 * Flatten a folder tree into options labelled by full path ("Athletics / Forms").
 * Folder names are unique only per parent, so a bare name is ambiguous both to
 * the model and to label -> id resolution; the path is what disambiguates.
 */
export function toFolderOptions(
  folders: FolderNode[],
  examplesById: Map<string, { examples: string[] }> = new Map()
): ClassifyOption[] {
  const byId = new Map(folders.map((f) => [f.id, f]));

  const pathOf = (folder: FolderNode): string => {
    const parts = [folder.name];
    const visited = new Set([folder.id]);
    let parentId = folder.parent_id;

    // `visited` guards against a parent_id cycle looping the ingestion worker.
    while (parentId && !visited.has(parentId)) {
      const parent = byId.get(parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      visited.add(parent.id);
      parentId = parent.parent_id;
    }

    return parts.join(" / ");
  };

  return folders.map((f) => ({
    id: f.id,
    name: pathOf(f),
    examples: examplesById.get(f.id)?.examples,
  }));
}

/** Options the model can actually pick: non-empty, unique, no sentinel clash. */
function usableOptions(options: ClassifyOption[]): ClassifyOption[] {
  const seen = new Set<string>();

  return options.filter((option) => {
    const label = option.name.trim();
    if (!label || label === NO_FIT) return false;
    if (seen.has(label.toLowerCase())) return false;
    seen.add(label.toLowerCase());
    return true;
  });
}

/**
 * Constrain the field to the exact labels on offer. An empty list collapses to
 * an enum of just the sentinel, so the model cannot invent an option.
 */
function choiceField(options: ClassifyOption[], kind: string) {
  const labels = options.map((o) => o.name.trim());

  return z
    .enum([NO_FIT, ...labels] as [string, ...string[]])
    .describe(`The best-fit ${kind}, or "${NO_FIT}" if none of them fit.`);
}

function optionBlock(heading: string, options: ClassifyOption[]): string {
  if (!options.length) {
    return `${heading}: (none defined — answer "${NO_FIT}")`;
  }

  const lines = options.map((option) => {
    const description = option.description?.trim();
    const examples = (option.examples ?? [])
      .map((e) => e.trim())
      .filter(Boolean)
      .slice(0, MAX_EXAMPLES);

    const parts = [`- "${option.name.trim()}"`];
    if (description) parts.push(`— ${description}`);
    if (examples.length) {
      parts.push(
        `(already filed here: ${examples.map((e) => `"${e}"`).join(", ")})`
      );
    }

    return parts.join(" ");
  });

  return `${heading}:\n${lines.join("\n")}`;
}

function resolveId(label: string, options: ClassifyOption[]): string | null {
  if (!label || label === NO_FIT) return null;
  const target = label.trim().toLowerCase();
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
  const categories = usableOptions(input.categories);
  const folders = usableOptions(input.folders);

  if (!categories.length && !folders.length) {
    return { categoryId: null, folderId: null };
  }

  const trimmed =
    input.content.length > CONTENT_MAX_CHARS
      ? input.content.slice(0, CONTENT_MAX_CHARS) + "..."
      : input.content;

  const { object } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: z.object({
      categoryName: choiceField(categories, "category"),
      folderName: choiceField(folders, "folder"),
    }),
    system: `You file a school document into the correct category and folder.

Rules:
- Choose ONLY from the provided lists, using the label exactly as written.
- Folder labels are full paths, e.g. "Athletics / Forms" means the "Forms"
  folder inside "Athletics". Match on the whole path, not just the last part.
- Where a description or already-filed examples are given, treat them as the
  definition of what belongs there — they outrank your reading of the name.
- If no option is a clear fit, answer "${NO_FIT}". Do not guess.
- Judge from the document's actual subject matter, not just keywords.`,
    prompt: `${optionBlock("Categories", categories)}

${optionBlock("Folders", folders)}

--- DOCUMENT ---
Title: ${input.title}

${trimmed}
--- END ---

Return the best-fit category and folder.`,
    temperature: 0.1,
    maxOutputTokens: 300,
    maxRetries: 2,
  });

  return {
    categoryId: resolveId(object.categoryName, categories),
    folderId: resolveId(object.folderName, folders),
  };
}
