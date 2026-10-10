/**
 * AI-processing consent (App Store Review Guideline 5.1.2(i)).
 *
 * Before a parent's first question, the chat shows a one-time notice that
 * their questions and the relevant school document excerpts are sent to
 * Google's Gemini API. Agreeing stamps profiles.ai_consent_at and
 * profiles.ai_consent_version (migration 035); the chat API route refuses to
 * call the model without both, so the dialog can't be bypassed by calling the
 * API directly.
 *
 * Bump AI_CONSENT_VERSION whenever the notice's substance changes (a new AI
 * provider, new data sent): every user is asked again on their next question.
 *
 * Kept free of server/Supabase imports so the client dialog, the server
 * action, the API route, and the tests all share it.
 */

export const AI_CONSENT_VERSION = "2026-10-09";

/** Machine-readable code the chat client matches to re-open the dialog. */
export const AI_CONSENT_REQUIRED_CODE = "ai_consent_required";

export const AI_CONSENT_REQUIRED_MESSAGE =
  "Before you can ask questions, please agree to AI processing: your questions and relevant school document excerpts are sent to Google's Gemini AI to generate answers. You can review this in your Profile.";

export interface AiConsentFields {
  ai_consent_at?: string | null;
  ai_consent_version?: string | null;
}

/** True when the user has agreed to the CURRENT version of the notice. */
export function hasAiConsent(
  profile: AiConsentFields | null | undefined
): boolean {
  return (
    !!profile?.ai_consent_at &&
    profile.ai_consent_version === AI_CONSENT_VERSION
  );
}

/**
 * The chat route's gate: a 403 JSON response when consent is missing, else
 * null. Never skipped by role — staff previewing the parent chat send the same
 * data to the same provider.
 */
export function aiConsentGate(
  profile: AiConsentFields | null | undefined
): Response | null {
  if (hasAiConsent(profile)) return null;
  return new Response(
    JSON.stringify({
      error: AI_CONSENT_REQUIRED_MESSAGE,
      code: AI_CONSENT_REQUIRED_CODE,
    }),
    { status: 403, headers: { "Content-Type": "application/json" } }
  );
}

/** Columns written when the user agrees. */
export function consentGrantedFields(now: Date = new Date()): Required<AiConsentFields> {
  return { ai_consent_at: now.toISOString(), ai_consent_version: AI_CONSENT_VERSION };
}

/** Columns written when the user withdraws consent. */
export function consentRevokedFields(): Required<AiConsentFields> {
  return { ai_consent_at: null, ai_consent_version: null };
}

/**
 * Whether a chat request error is the consent gate (the AI SDK surfaces the
 * response body as the error message).
 */
export function isAiConsentError(message: string | null | undefined): boolean {
  return !!message && message.includes(AI_CONSENT_REQUIRED_CODE);
}
