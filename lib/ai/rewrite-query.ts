import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { formatGrade } from "@/lib/grades";
import type { ChildContext } from "./context";

interface ChatMessage {
  role: string;
  parts?: { type: string; text?: string }[];
  content?: string;
}

/**
 * Rewrites a follow-up question into a standalone query using conversation context.
 * This improves RAG search results for vague follow-ups like "What about Wednesdays?"
 * by incorporating context from previous messages.
 *
 * The parent's children are passed in so references to them resolve into terms
 * that actually appear in the documents: "and my other kid?" is useless as a
 * search query, while "8th grade Middle School dress code" retrieves the right
 * division's handbook.
 *
 * Returns the original query unchanged if there's no conversation history.
 */
export async function rewriteQueryWithContext(
  messages: ChatMessage[],
  lastMessageText: string,
  children: ChildContext[] = []
): Promise<string> {
  // Only 1 user message — no context needed, return as-is
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length <= 1) {
    return lastMessageText;
  }

  // If the message is already long/specific enough, skip rewriting.
  // 25 words catches long-but-vague follow-ups ("ok so about that thing
  // you mentioned with the bus schedule on Wednesdays, what time again?")
  // while still skipping rewrite for truly standalone long queries.
  if (lastMessageText.split(" ").length > 25) {
    return lastMessageText;
  }

  // Take the last 4 messages (excluding the current one) for context
  const recentHistory = messages.slice(-5, -1);
  const historyText = recentHistory
    .map((m) => {
      const text =
        m.parts
          ?.filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("") ||
        m.content ||
        "";
      return `${m.role}: ${text.slice(0, 300)}`;
    })
    .join("\n");

  const childrenBlock =
    children.length > 0
      ? `\nThe parent's children (grade levels, not ages):\n${children
          .map((c) => `- ${c.name}: ${formatGrade(c.grade)}`)
          .join("\n")}\n`
      : "";

  const childrenRule =
    children.length > 0
      ? `\n- If the follow-up refers to a child ("Mia", "my other kid", "my 8th grader", "the younger one"), resolve it to that child's grade level in the query, since documents are organised by grade and division rather than by name.`
      : "";

  try {
    const { text, finishReason } = await generateText({
      model: google("gemini-2.5-flash"),
      prompt: `Rewrite the follow-up question as a standalone search query for a school document search.

Rules:
- Return ONLY the rewritten query, nothing else.
- It must be a complete, self-contained question — never a sentence fragment.
- Resolve pronouns and references using the conversation.
- Keep the parent's own wording where it is already specific.${childrenRule}

Conversation:
${historyText}
${childrenBlock}
Follow-up: ${lastMessageText}

Standalone query:`,
      maxOutputTokens: 150,
      temperature: 0,
      // Gemini 2.5 charges thinking tokens against maxOutputTokens. Left on,
      // reasoning consumed ~140 of the 150 and the rewrite was cut off
      // mid-phrase ("What time does Mia,") — which then became the search
      // query. Rewriting one sentence needs no deliberation.
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    });

    const rewritten = text.trim();
    // Truncated output is worse than no rewrite at all.
    if (finishReason === "length") return lastMessageText;
    // Sanity check: if the model returned something weird, fall back to original.
    // A rewrite that ends mid-phrase ("What is the dress code for") searches
    // worse than the raw follow-up, so treat dangling connectives as a failure.
    const endsMidPhrase = /\b(for|of|in|to|about|with|the|a|an|and|or|my)$/i.test(
      rewritten.replace(/[?.!\s]+$/, "")
    );
    if (!rewritten || rewritten.length > 300 || rewritten.length < 3 || endsMidPhrase) {
      return lastMessageText;
    }
    return rewritten;
  } catch (error) {
    // Non-fatal — fall back to original query
    console.warn("[rewrite-query] Failed, using original:", error);
    return lastMessageText;
  }
}
