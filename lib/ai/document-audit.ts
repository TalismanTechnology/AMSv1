import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import {
  SCHOOL_CHECKLIST,
  TOTAL_CHECKLIST_ITEMS,
  type ChecklistCategory,
} from "./school-checklist";

// ── Types ────────────────────────────────────────────

export interface DocumentInput {
  title: string;
  description: string | null;
  summary: string | null;
  category: string | null;
  folder: string | null;
  tags: string[] | null;
  file_type: string | null;
}

export interface ChecklistMatch {
  itemId: string;
  status: "covered" | "missing";
  /** Document title that covers this item (if covered) */
  matchedDocument: string | null;
  /** Confidence note from the AI */
  note: string | null;
}

export interface CategoryResult {
  categoryId: string;
  categoryName: string;
  totalItems: number;
  coveredItems: number;
  items: ChecklistMatch[];
}

export interface AuditResult {
  categories: CategoryResult[];
  totalItems: number;
  totalCovered: number;
  overallScore: number;
  summary: string;
}

// ── AI matching schema (per batch) ───────────────────

const MatchSchema = z.object({
  matches: z.array(
    z.object({
      itemId: z.string().describe("The checklist item ID"),
      status: z
        .enum(["covered", "missing"])
        .describe("Whether the school's documents cover this checklist item"),
      matchedDocument: z
        .string()
        .nullable()
        .describe("Title of the document that covers this item, or null if missing"),
      note: z
        .string()
        .nullable()
        .describe("Brief note on the match quality or why it's missing (optional)"),
    })
  ),
});

// ── Core function ────────────────────────────────────

/**
 * Compare a school's documents against the comprehensive checklist.
 * Processes one category at a time to keep prompts focused.
 */
export async function analyzeDocumentGaps(
  documents: DocumentInput[],
  schoolName: string
): Promise<AuditResult> {
  const docList = documents
    .map((d) => {
      const parts = [`- "${d.title}"`];
      if (d.category) parts.push(`[${d.category}]`);
      if (d.tags && d.tags.length > 0) parts.push(`tags: ${d.tags.join(", ")}`);
      if (d.summary) parts.push(`— ${d.summary.slice(0, 150)}`);
      return parts.join(" ");
    })
    .join("\n");

  const documentContext =
    documents.length > 0
      ? `The school "${schoolName}" has ${documents.length} documents:\n${docList}`
      : `The school "${schoolName}" has no documents uploaded yet.`;

  // Process all categories in parallel
  const categoryResults = await Promise.all(
    SCHOOL_CHECKLIST.map((category) =>
      matchCategory(category, documentContext)
    )
  );

  const totalCovered = categoryResults.reduce(
    (sum, c) => sum + c.coveredItems,
    0
  );
  const overallScore = Math.round(
    (totalCovered / TOTAL_CHECKLIST_ITEMS) * 100
  );

  return {
    categories: categoryResults,
    totalItems: TOTAL_CHECKLIST_ITEMS,
    totalCovered,
    overallScore,
    summary:
      documents.length === 0
        ? `No documents have been uploaded yet. Your school needs coverage across ${TOTAL_CHECKLIST_ITEMS} checklist items.`
        : `Your school covers ${totalCovered} of ${TOTAL_CHECKLIST_ITEMS} checklist items (${overallScore}%). Focus on critical missing items first.`,
  };
}

async function matchCategory(
  category: ChecklistCategory,
  documentContext: string
): Promise<CategoryResult> {
  const checklistBlock = category.items
    .map(
      (item) =>
        `- ${item.id}: "${item.name}" — ${item.description} [${item.priority}]`
    )
    .join("\n");

  const { object } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: MatchSchema,
    system: `You are a school document auditor. You compare a school's uploaded documents against a checklist of required items.

For each checklist item, determine if ANY of the school's documents cover that topic — even partially. A document can cover multiple checklist items. Use the document title, category, tags, and summary to make your judgment.

Rules:
- Mark "covered" if a document clearly addresses the checklist topic, even if not a perfect 1:1 match
- Mark "covered" if the topic would reasonably be included in one of the school's broader documents (e.g., a "Student Handbook" likely covers dress code, attendance, etc.)
- Mark "missing" if no document appears to address the topic
- When marking "covered", set matchedDocument to the title of the most relevant document
- Keep notes very brief (5-10 words max) or null`,
    prompt: `${documentContext}

## Checklist Category: ${category.name}
${checklistBlock}

For each checklist item above, determine if the school's documents cover it.`,
    temperature: 0.2,
    maxRetries: 3,
  });

  // Build result, defaulting any items the AI missed to "missing"
  const matchMap = new Map(
    object.matches.map((m) => [m.itemId, m])
  );

  const items: ChecklistMatch[] = category.items.map((item) => {
    const match = matchMap.get(item.id);
    return {
      itemId: item.id,
      status: match?.status ?? "missing",
      matchedDocument: match?.matchedDocument ?? null,
      note: match?.note ?? null,
    };
  });

  const coveredItems = items.filter((i) => i.status === "covered").length;

  return {
    categoryId: category.id,
    categoryName: category.name,
    totalItems: category.items.length,
    coveredItems,
    items,
  };
}
