import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Signing a parent in to the iOS / Android app.
//
// The app shows the site in a web view, but Blackbaud sign-in runs in the
// system sign-in sheet (ASWebAuthenticationSession / Custom Tabs), which has
// its own cookies. So the callback can't set the session where it's needed.
// Instead:
//
//   1. The app makes a random verifier and starts sign-in with its S256
//      challenge (/auth/blackbaud?school=…&app_challenge=…).
//   2. The callback verifies the parent as usual, then stores a one-time code
//      bound to that challenge and redirects to app.askmyschool://auth-callback.
//   3. The app catches that URL and posts code + verifier from the web view
//      to /auth/app-handoff, which starts the session there.
//
// The verifier never leaves the app, so a code intercepted on the way (another
// Android app claiming the scheme, say) is useless on its own.

export const APP_URL_SCHEME = "app.askmyschool";
export const APP_CALLBACK_URL = `${APP_URL_SCHEME}://auth-callback`;

const HANDOFF_TTL_MS = 2 * 60 * 1000;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isValidAppChallenge(value: string | null | undefined): value is string {
  return typeof value === "string" && CHALLENGE_PATTERN.test(value);
}

export function challengeForVerifier(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function verifierMatchesChallenge(verifier: string, challenge: string): boolean {
  if (!verifier) return false;
  const actual = Buffer.from(challengeForVerifier(verifier));
  const expected = Buffer.from(challenge);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function newHandoffCode(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashHandoffCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function appCallbackUrl(
  result: { code: string } | { error: string; school?: string }
): string {
  const params = new URLSearchParams(
    "code" in result
      ? { code: result.code }
      : { error: result.error, ...(result.school ? { school: result.school } : {}) }
  );
  return `${APP_CALLBACK_URL}?${params.toString()}`;
}

/** Stores a one-time code for a verified parent and returns it. */
export async function createAppHandoff(input: {
  email: string;
  schoolSlug: string;
  appChallenge: string;
}): Promise<string> {
  const code = newHandoffCode();
  const admin = createAdminClient();

  const { error } = await admin.from("app_sign_in_handoffs").insert({
    code_hash: hashHandoffCode(code),
    email: input.email,
    school_slug: input.schoolSlug,
    app_challenge: input.appChallenge,
    expires_at: new Date(Date.now() + HANDOFF_TTL_MS).toISOString(),
  });

  if (error) {
    throw new Error(`Could not store app sign-in handoff: ${error.message}`);
  }

  return code;
}

/**
 * Redeems a code exactly once. Returns null when the code is unknown, used,
 * expired, or the verifier doesn't match the challenge it was issued for.
 */
export async function redeemAppHandoff(
  code: string,
  verifier: string
): Promise<{ email: string; schoolSlug: string } | null> {
  const admin = createAdminClient();

  // Claim it atomically: a second redeem finds used_at already set.
  const { data, error } = await admin
    .from("app_sign_in_handoffs")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", hashHandoffCode(code))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("email, school_slug, app_challenge")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not redeem app sign-in handoff: ${error.message}`);
  }

  if (!data || !verifierMatchesChallenge(verifier, data.app_challenge)) {
    return null;
  }

  return { email: data.email, schoolSlug: data.school_slug };
}
