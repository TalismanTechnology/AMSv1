import crypto from "node:crypto";

// Emailed one-time sign-in codes for roster schools: the pure rules. Database
// I/O is in login-code-store.ts, so everything here is unit tested.
//
// A code is 6 random digits, valid for 10 minutes and 5 tries. It is stored
// only as HMAC-SHA256("<schoolId>:<email>:<code>") keyed with a server
// secret, so a database leak doesn't reveal working codes and a code for one
// school/email can't be replayed for another.

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS_PER_CODE = 5;

export const RATE_LIMITS = {
  /** Code requests per school + email. */
  emailPer15Minutes: 3,
  emailPer24Hours: 10,
  /** Code requests per (hashed) IP address. */
  ipPerHour: 20,
  /** Wrong codes per school + email, across codes. */
  failedVerifiesPer15Minutes: 10,
} as const;

export const MINUTE_MS = 60 * 1000;

/** LOGIN_CODE_SECRET, else the Blackbaud token key (already set in prod). */
export function getLoginCodeSecret(): string | null {
  return process.env.LOGIN_CODE_SECRET || process.env.BLACKBAUD_TOKEN_ENC_KEY || null;
}

export function generateLoginCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** "123 456" / "123-456" → "123456"; anything else that isn't 6 digits → null. */
export function normalizeLoginCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function hashLoginCode(secret: string, schoolId: string, email: string, code: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${schoolId}:${email}:${code}`)
    .digest("hex");
}

export function loginCodeMatches(
  secret: string,
  schoolId: string,
  email: string,
  code: string,
  storedHash: string
): boolean {
  const actual = Buffer.from(hashLoginCode(secret, schoolId, email, code), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/**
 * Keyed hash of the client IP (first X-Forwarded-For hop), for the per-IP
 * limit. The address itself is never stored.
 */
export function hashClientIp(secret: string, forwardedFor: string | null | undefined): string {
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";
  return crypto.createHmac("sha256", secret).update(`ip:${ip}`).digest("hex");
}

/**
 * Stands in for the email on rows recorded for addresses that aren't on the
 * roster, so they still count toward the limits without keeping what
 * someone typed.
 */
export function unlistedEmailKey(secret: string, schoolId: string, email: string): string {
  return `unlisted:${crypto.createHmac("sha256", secret).update(`${schoolId}:${email}`).digest("hex")}`;
}

/** Short, non-reversible tag for logs. Never log the email or the code. */
export function emailLogTag(email: string): string {
  return crypto.createHash("sha256").update(email).digest("hex").slice(0, 10);
}

export type CodeRequestDecision =
  | { allowed: true }
  | { allowed: false; reason: "email_15_minutes" | "email_24_hours" | "ip_hour" };

export function decideCodeRequest(counts: {
  emailLast15Minutes: number;
  emailLast24Hours: number;
  ipLastHour: number;
}): CodeRequestDecision {
  if (counts.ipLastHour >= RATE_LIMITS.ipPerHour) return { allowed: false, reason: "ip_hour" };
  if (counts.emailLast15Minutes >= RATE_LIMITS.emailPer15Minutes) {
    return { allowed: false, reason: "email_15_minutes" };
  }
  if (counts.emailLast24Hours >= RATE_LIMITS.emailPer24Hours) {
    return { allowed: false, reason: "email_24_hours" };
  }
  return { allowed: true };
}

export interface StoredCode {
  expires_at: string;
  attempts: number;
  consumed_at: string | null;
}

export type VerificationDecision =
  | "ok"
  | "no_code"
  | "expired"
  | "too_many_attempts"
  | "wrong_code";

/**
 * `code` is the newest unconsumed code for this school + email (or null);
 * `matches` whether the typed code hashes to it.
 */
export function decideVerification(input: {
  code: StoredCode | null;
  matches: boolean;
  recentFailedAttempts: number;
  now: Date;
}): VerificationDecision {
  if (input.recentFailedAttempts >= RATE_LIMITS.failedVerifiesPer15Minutes) {
    return "too_many_attempts";
  }
  const { code } = input;
  if (!code || code.consumed_at) return "no_code";
  if (new Date(code.expires_at).getTime() <= input.now.getTime()) return "expired";
  if (code.attempts >= MAX_ATTEMPTS_PER_CODE) return "too_many_attempts";
  return input.matches ? "ok" : "wrong_code";
}
