import crypto from "node:crypto";

// A short-lived signed link to one event's .ics, for the iOS app.
//
// In the app, Apple Calendar is reached by opening the .ics in Safari (the
// web view can't hand a calendar file to Calendar; see add-to-calendar.tsx),
// and Safari doesn't have the web view's session cookies. So the app first
// asks POST /api/events/[id]/ics (cookie auth, membership and lock checked)
// for a link carrying one of these, bound to that user and that event, valid
// for a few minutes. It reads one event; it can't list or reach any other.
//
// Signed with a key derived from the service-role key and a fixed label, so
// it needs no new secret and can't be confused with anything else signed
// with the same secret. Never log a token.

export const ICS_TOKEN_TTL_MS = 5 * 60 * 1000;

export function icsSigningKey(
  env: Record<string, string | undefined> = process.env
): Buffer | null {
  const raw = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw) return null;
  return crypto.createHmac("sha256", raw).update("ams:event-ics-link:v1").digest();
}

function sign(payload: string, key: Buffer): string {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

export function signIcsToken(
  claims: { userId: string; eventId: string; expiresAt: number },
  key: Buffer
): string {
  const payload = Buffer.from(
    JSON.stringify({ u: claims.userId, ev: claims.eventId, e: claims.expiresAt })
  ).toString("base64url");
  return `v1.${payload}.${sign(payload, key)}`;
}

export function issueIcsToken(
  userId: string,
  eventId: string,
  key: Buffer,
  now: number = Date.now()
): string {
  return signIcsToken({ userId, eventId, expiresAt: now + ICS_TOKEN_TTL_MS }, key);
}

/**
 * The user a token was issued to, when it's one we signed, for this event,
 * and unexpired; else null.
 */
export function verifyIcsToken(
  token: string | null | undefined,
  expected: { eventId: string; now?: number },
  key: Buffer
): { userId: string } | null {
  if (!token || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, payload, signature] = parts;
  const actual = Buffer.from(signature, "base64url");
  const wanted = Buffer.from(sign(payload, key), "base64url");
  if (actual.length !== wanted.length || !crypto.timingSafeEqual(actual, wanted)) return null;

  let claims: { u?: unknown; ev?: unknown; e?: unknown };
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const now = expected.now ?? Date.now();
  if (
    typeof claims.u !== "string" ||
    !claims.u ||
    claims.ev !== expected.eventId ||
    typeof claims.e !== "number" ||
    claims.e <= now ||
    // Never honor a token that claims to last longer than we ever issue.
    claims.e > now + ICS_TOKEN_TTL_MS
  ) {
    return null;
  }
  return { userId: claims.u };
}
