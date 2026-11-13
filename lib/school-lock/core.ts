import crypto from "node:crypto";

// The school "owner lock": a password a school's own admins set to keep the
// platform super-admin out of their school unless it's entered. This file is
// the pure part (no database, no Next.js): password hashing, the signed
// unlock cookie, the rate-limit rule and the access decision. The server side
// lives in ./store.ts (database) and ./access.ts (guards).

export const SCHOOL_LOCKED_ERROR = "School is locked";

export const LOCK_PASSWORD_MIN_LENGTH = 8;
export const LOCK_PASSWORD_MAX_LENGTH = 256;

/** How long a correct password unlocks the school for. */
export const UNLOCK_TTL_MS = 4 * 60 * 60 * 1000;

/** Failed unlock attempts allowed per user + school in the window. */
export const UNLOCK_MAX_FAILED_ATTEMPTS = 5;
export const UNLOCK_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

// ── Password hashing ───────────────────────────────────────────────

// scrypt cost: N=2^15, r=8, p=1 (~32 MiB, tens of ms). maxmem must cover
// 128 * N * r bytes or Node refuses.
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize("NFKC"),
      salt,
      SCRYPT_KEYLEN,
      { N: n, r, p, maxmem: SCRYPT_MAXMEM },
      (err, key) => (err ? reject(err) : resolve(key))
    );
  });
}

/** Why a new lock password isn't acceptable, or null if it is. */
export function lockPasswordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < LOCK_PASSWORD_MIN_LENGTH) {
    return `Use at least ${LOCK_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > LOCK_PASSWORD_MAX_LENGTH) {
    return `Use at most ${LOCK_PASSWORD_MAX_LENGTH} characters.`;
  }
  if (!password.trim()) return "The password can't be only spaces.";
  return null;
}

/** "scrypt$N$r$p$<salt>$<hash>", with a fresh random salt each time. */
export async function hashLockPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

/** Constant-time check of a password against a stored hash. */
export async function verifyLockPassword(password: unknown, stored: string): Promise<boolean> {
  if (typeof password !== "string" || !password) return false;
  if (password.length > LOCK_PASSWORD_MAX_LENGTH) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  // Only parameters we could have written; a tampered row can't make us
  // allocate gigabytes.
  if (n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (salt.length < 16 || expected.length !== SCRYPT_KEYLEN) return false;
  const actual = await scrypt(password, salt, n, r, p);
  return crypto.timingSafeEqual(actual, expected);
}

// ── Signed unlock cookie ───────────────────────────────────────────

/** Per-school cookie name, so unlocking one school never unlocks another. */
export function unlockCookieName(schoolId: string): string {
  return `ams_unlock_${schoolId.replace(/[^a-zA-Z0-9-]/g, "")}`;
}

/**
 * HMAC key for unlock tokens, derived from an existing server secret (a
 * dedicated SCHOOL_LOCK_SECRET if set) with a fixed label so the token can't
 * be confused with anything else signed with the same secret.
 */
export function unlockSigningKey(
  env: Record<string, string | undefined> = process.env
): Buffer | null {
  const raw =
    env.SCHOOL_LOCK_SECRET || env.BLACKBAUD_TOKEN_ENC_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw) return null;
  return crypto.createHmac("sha256", raw).update("ams:school-owner-lock:v1").digest();
}

/**
 * A short value derived from the stored hash. Signed into every unlock token,
 * so changing the password (new salt, new hash) or removing and re-adding it
 * invalidates every outstanding unlock.
 */
export function lockVersion(passwordHash: string, key: Buffer): string {
  return crypto
    .createHmac("sha256", key)
    .update(`version:${passwordHash}`)
    .digest("base64url")
    .slice(0, 22);
}

interface UnlockClaims {
  schoolId: string;
  userId: string;
  version: string;
  expiresAt: number;
}

function sign(payload: string, key: Buffer): string {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

export function signUnlockToken(claims: UnlockClaims, key: Buffer): string {
  const payload = Buffer.from(
    JSON.stringify({ s: claims.schoolId, u: claims.userId, v: claims.version, e: claims.expiresAt })
  ).toString("base64url");
  return `v1.${payload}.${sign(payload, key)}`;
}

/** True only for an unexpired token we signed for this school, user and lock version. */
export function verifyUnlockToken(
  token: string | null | undefined,
  expected: { schoolId: string; userId: string; version: string; now?: number },
  key: Buffer
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const [, payload, signature] = parts;
  const actual = Buffer.from(signature, "base64url");
  const wanted = Buffer.from(sign(payload, key), "base64url");
  if (actual.length !== wanted.length || !crypto.timingSafeEqual(actual, wanted)) return false;

  let claims: { s?: unknown; u?: unknown; v?: unknown; e?: unknown };
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  const now = expected.now ?? Date.now();
  return (
    claims.s === expected.schoolId &&
    claims.u === expected.userId &&
    claims.v === expected.version &&
    typeof claims.e === "number" &&
    claims.e > now &&
    // Never honor a token that claims to last longer than we ever issue.
    claims.e <= now + UNLOCK_TTL_MS
  );
}

// ── Rate limit ─────────────────────────────────────────────────────

/**
 * Whether another unlock attempt is allowed, given the user's failed attempts
 * for this school (timestamps in ms). Returns when the oldest counted failure
 * ages out, so the screen can say how long to wait.
 */
export function unlockRateLimit(
  failedAttemptTimes: number[],
  now: number = Date.now()
): { allowed: true } | { allowed: false; retryAt: number } {
  const recent = failedAttemptTimes
    .filter((t) => t > now - UNLOCK_ATTEMPT_WINDOW_MS && t <= now)
    .sort((a, b) => a - b);
  if (recent.length < UNLOCK_MAX_FAILED_ATTEMPTS) return { allowed: true };
  const oldestCounted = recent[recent.length - UNLOCK_MAX_FAILED_ATTEMPTS];
  return { allowed: false, retryAt: oldestCounted + UNLOCK_ATTEMPT_WINDOW_MS };
}

// ── Access decision ────────────────────────────────────────────────

export interface SchoolAccessInput {
  isSuperAdmin: boolean;
  /** The requester's own membership in this school, if any. */
  membership: { role: string; approved: boolean } | null;
  /** "admin" for admin pages and actions; "member" for parent-level ones. */
  need: "admin" | "member";
  /** The school has an owner lock set. */
  locked: boolean;
  /** The requester holds a valid unlock for this school. */
  unlocked: boolean;
}

export type SchoolAccess = "allow" | "locked" | "deny";

/** True when the requester's own membership is enough, without platform privileges. */
export function hasGenuineAccess(
  membership: SchoolAccessInput["membership"],
  need: SchoolAccessInput["need"]
): boolean {
  if (!membership?.approved) return false;
  return need === "member" || membership.role === "admin";
}

/**
 * Whether a requester may use a school. Only one case is ever "locked": a
 * super-admin who is there purely through platform privileges, while the
 * school has an owner lock and they haven't unlocked it. A genuine admin or
 * member of the school is never affected, and neither are service paths
 * (crons, email intake, the chat pipeline's own reads), which don't run as a
 * user and never consult this.
 */
export function decideSchoolAccess(input: SchoolAccessInput): SchoolAccess {
  if (hasGenuineAccess(input.membership, input.need)) return "allow";
  if (!input.isSuperAdmin) return "deny";
  if (!input.locked || input.unlocked) return "allow";
  return "locked";
}
