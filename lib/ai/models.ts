// The one place the Gemini text-model ID lives. Google closes older models to
// new API keys (gemini-2.5-* now 404s with "no longer available to new
// users"), so switching models should be a one-line change or an env var.
// Embeddings use a separate model (see embeddings.ts) and are unaffected.

const DEFAULT_TEXT_MODEL_ID = "gemini-3.8-flash";

/** The Gemini model used for every text-generation call. Override with GEMINI_TEXT_MODEL. */
export const TEXT_MODEL_ID = process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL_ID;

/**
 * Provider options for a call that needs no deliberation (a one-line rewrite,
 * a label). Gemini 3 models control thinking with `thinkingLevel` — a legacy
 * `thinkingBudget: 0` is not a documented "off" for them. Use "low", not
 * "minimal": gemini-3.8-flash rejects MINIMAL with HTTP 400 ("Thinking level
 * MINIMAL is not supported for this model"), and "low" is what the answer
 * path already uses for simple questions (0 reasoning tokens in practice).
 * Older models (gemini-2.x, if GEMINI_TEXT_MODEL points
 * at one) keep `thinkingBudget: 0`. Never both: the API rejects that.
 */
export function minimalThinkingOptions(modelId: string = TEXT_MODEL_ID) {
  return /^gemini-[3-9]/i.test(modelId.trim())
    ? { google: { thinkingConfig: { thinkingLevel: "low" as const } } }
    : { google: { thinkingConfig: { thinkingBudget: 0 } } };
}
