import { generateText } from "ai";
import { google } from "@ai-sdk/google";

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
 * Returns the original query unchanged if there's no conversation history.
 */
export async function rewriteQueryWithContext(
  messages: ChatMessage[],
  lastMessageText: string
): Promise<string> {
  // Only 1 user message — no context needed, return as-is
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length <= 1) {
    return lastMessageText;
  }

  // If the message is already long/specific enough, skip rewriting
  if (lastMessageText.split(" ").length > 12) {
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

  try {
    const { text } = await generateText({
      model: google("gemini-2.0-flash"),
      prompt: `Given this conversation, rewrite the follow-up question as a standalone search query. Return ONLY the rewritten query, nothing else.

Conversation:
${historyText}

Follow-up: ${lastMessageText}

Standalone query:`,
      maxOutputTokens: 150,
      temperature: 0,
    });

    const rewritten = text.trim();
    // Sanity check: if the model returned something weird, fall back to original
    if (!rewritten || rewritten.length > 300 || rewritten.length < 3) {
      return lastMessageText;
    }
    return rewritten;
  } catch (error) {
    // Non-fatal — fall back to original query
    console.warn("[rewrite-query] Failed, using original:", error);
    return lastMessageText;
  }
}
