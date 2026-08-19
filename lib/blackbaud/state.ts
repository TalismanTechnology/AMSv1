import crypto from "node:crypto";

// The OAuth `state` round-trips through Blackbaud and comes back attacker-
// reachable. It carries the school id, so an unsigned state would let anyone
// who starts a connect flow bind a Blackbaud authorization to a school they
// don't administer. Sign it and verify on the way back.

const MAX_AGE_MS = 10 * 60 * 1000;

// Name of the cookie that binds a callback to the browser that started the
// flow. A signature alone proves we minted the state, not that this browser
// received it — without the cookie an attacker can replay their own valid
// state against a consent they phished from an unrelated Blackbaud org, and
// land that org's tokens under their own school.
export const OAUTH_STATE_COOKIE = "bb_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = MAX_AGE_MS / 1000;

function getSigningKey(): Buffer {
  // Reuses the token encryption key as HMAC material — same trust boundary,
  // one fewer secret to provision and rotate.
  const raw = process.env.BLACKBAUD_TOKEN_ENC_KEY;

  if (!raw) {
    throw new Error("BLACKBAUD_TOKEN_ENC_KEY not configured");
  }

  return Buffer.from(raw, "base64");
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", getSigningKey())
    .update(payload)
    .digest("base64url");
}

export function createOAuthState(schoolId: string, schoolSlug: string): string {
  const payload = Buffer.from(
    JSON.stringify({ schoolId, schoolSlug, issuedAt: Date.now() })
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export interface OAuthState {
  schoolId: string;
  schoolSlug: string;
}

function constantTimeEquals(a: string, b: string): boolean {
  // Lengths must match before timingSafeEqual or it throws.
  return (
    a.length === b.length &&
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}

/**
 * Returns null for anything that fails verification — a bad signature, a
 * malformed payload, an expired state, or a state that doesn't match the one
 * this browser was issued are all "reject the callback".
 *
 * `cookieState` is the value stored at /connect. It must be supplied: the
 * signature proves we minted the state, only the cookie proves this browser is
 * the one we minted it for.
 */
export function verifyOAuthState(
  state: string,
  cookieState: string | undefined
): OAuthState | null {
  if (!cookieState || !constantTimeEquals(state, cookieState)) {
    return null;
  }

  const [payload, signature] = state.split(".");

  if (!payload || !signature) {
    return null;
  }

  if (!constantTimeEquals(signature, sign(payload))) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());

    if (
      typeof decoded.schoolId !== "string" ||
      typeof decoded.schoolSlug !== "string" ||
      typeof decoded.issuedAt !== "number" ||
      Date.now() - decoded.issuedAt > MAX_AGE_MS
    ) {
      return null;
    }

    return { schoolId: decoded.schoolId, schoolSlug: decoded.schoolSlug };
  } catch {
    return null;
  }
}
