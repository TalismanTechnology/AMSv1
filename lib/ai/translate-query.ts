import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { TEXT_MODEL_ID, minimalThinkingOptions } from "@/lib/ai/models";
import type { StageTimer } from "./timing";

/**
 * How long a Spanish question may wait for its English search query before
 * retrieval goes ahead with the Spanish text. The rewrite with the same config
 * takes 1.2–1.9 s in production.
 */
export const TRANSLATE_TIMEOUT_MS = 2500;

type Generate = (options: Parameters<typeof generateText>[0]) => Promise<{
  text: string;
  finishReason: string;
  usage?: { outputTokenDetails?: { reasoningTokens?: number } };
}>;

export interface TranslatedQuery {
  /** The English search query, or the original text on any failure. */
  query: string;
  translated: boolean;
}

/** The translation prompt. Exported for the tests. */
export function translationPrompt(question: string): string {
  return `Translate this question from a parent to their child's school into English. It will be used to search the school's documents, which are in English.

Rules:
- Return ONLY the English translation, nothing else.
- Keep names of people, places, programs, events and rooms, and all dates, times, numbers and amounts, exactly as written.
- Keep any text in square brackets, like [your 8th Grade child], exactly as written.
- If it is already in English, return it unchanged.

Question: ${question.slice(0, 1000)}

English:`;
}

/**
 * The English search query for a Spanish question, so retrieval (embedding
 * and keyword search) matches the school's English documents. The parent's
 * own words are still what the answer model sees and answers.
 *
 * Same call config as the follow-up rewrite (lib/ai/rewrite-query.ts):
 * thinkingBudget 0 via minimalThinkingOptions — never thinkingLevel
 * "minimal", which gemini-3.8-flash rejects with HTTP 400. Any failure,
 * timeout or odd output falls back to the original text with one log line
 * (no question text in it) and never throws: a parent never sees an error
 * from this step.
 *
 * `question` must already be redacted (lib/ai/child-privacy.ts).
 */
export async function translateQueryToEnglish(
  question: string,
  {
    timeoutMs = TRANSLATE_TIMEOUT_MS,
    generate = generateText as unknown as Generate,
    modelId = TEXT_MODEL_ID,
    timer,
  }: {
    timeoutMs?: number;
    /** Injected by the tests. */
    generate?: Generate;
    modelId?: string;
    /** Notes the call's thinking-token count on the chat-timing line. */
    timer?: StageTimer;
  } = {}
): Promise<TranslatedQuery> {
  const fallback = (reason: string): TranslatedQuery => {
    console.warn(`[chat-translate] Using the original question for search (${reason})`);
    return { query: question, translated: false };
  };
  if (!question.trim()) return { query: question, translated: false };

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timeout = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, timeoutMs);
  });
  try {
    const call = generate({
      model: google(modelId),
      prompt: translationPrompt(question),
      maxOutputTokens: 256,
      temperature: 0,
      maxRetries: 0,
      abortSignal: controller.signal,
      providerOptions: minimalThinkingOptions(modelId),
    });
    // The abort should end the call; the race makes sure of it.
    call.catch(() => {});
    const result = await Promise.race([call, timedOut]);
    if (result === "timeout") return fallback("timeout");

    timer?.note("translateReasoningTokens", result.usage?.outputTokenDetails?.reasoningTokens ?? null);
    const query = result.text.trim().replace(/^["“]|["”]$/g, "").trim();
    if (result.finishReason === "length") return fallback("truncated");
    if (query.length < 3 || query.length > 400) return fallback("unusable output");
    return { query, translated: true };
  } catch (error) {
    const name = error instanceof Error ? error.name : "error";
    return fallback(controller.signal.aborted ? "timeout" : `failed: ${name}`);
  } finally {
    clearTimeout(timeout);
  }
}
