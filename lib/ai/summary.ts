import { generateText } from "ai";
import { google } from "@ai-sdk/google";

const SUMMARY_MAX_CHARS = 8000;

export async function generateSummary(
  text: string,
  documentTitle: string
): Promise<string> {
  const truncated =
    text.length > SUMMARY_MAX_CHARS
      ? text.slice(0, SUMMARY_MAX_CHARS) + "..."
      : text;

  const { text: summary } = await generateText({
    model: google("gemini-2.0-flash"),
    prompt: `You are summarizing a school document for parents.

Document title: "${documentTitle}"

Document content:
${truncated}

Write a 2-3 sentence summary of what this document contains and why it would be useful to parents. Be specific and factual. Do not use phrases like "This document..." or "This text...".`,
    maxOutputTokens: 150,
    temperature: 0.3,
  });

  return summary.trim();
}
