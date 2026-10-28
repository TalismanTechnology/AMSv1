// The one place the Gemini text-model ID lives. Google closes older models to
// new API keys (gemini-2.5-* now 404s with "no longer available to new
// users"), so switching models should be a one-line change or an env var.
// Embeddings use a separate model (see embeddings.ts) and are unaffected.

const DEFAULT_TEXT_MODEL_ID = "gemini-3.8-flash";

/** The Gemini model used for every text-generation call. Override with GEMINI_TEXT_MODEL. */
export const TEXT_MODEL_ID = process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL_ID;
