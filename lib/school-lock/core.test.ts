import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOCK_PASSWORD_MIN_LENGTH,
  UNLOCK_ATTEMPT_WINDOW_MS,
  UNLOCK_MAX_FAILED_ATTEMPTS,
  UNLOCK_TTL_MS,
  decideSchoolAccess,
  hasGenuineAccess,
  hashLockPassword,
  lockPasswordProblem,
  lockVersion,
  signUnlockToken,
  unlockCookieName,
  unlockRateLimit,
  unlockSigningKey,
  verifyLockPassword,
  verifyUnlockToken,
  type SchoolAccessInput,
} from "./core";

const SCHOOL = "11111111-1111-1111-1111-111111111111";
const OTHER_SCHOOL = "22222222-2222-2222-2222-222222222222";
const USER = "33333333-3333-3333-3333-333333333333";
const OTHER_USER = "44444444-4444-4444-4444-444444444444";
const KEY = unlockSigningKey({ SCHOOL_LOCK_SECRET: "test-secret" })!;

// ── Hashing ────────────────────────────────────────────────────────

test("hashLockPassword never stores the password and salts every hash", async () => {
  const a = await hashLockPassword("correct horse battery");
  const b = await hashLockPassword("correct horse battery");
  assert.match(a, /^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.ok(!a.includes("correct horse battery"));
  assert.notEqual(a, b);
});

test("verifyLockPassword accepts only the right password", async () => {
  const hash = await hashLockPassword("correct horse battery");
  assert.equal(await verifyLockPassword("correct horse battery", hash), true);
  assert.equal(await verifyLockPassword("correct horse batterY", hash), false);
  assert.equal(await verifyLockPassword("", hash), false);
  assert.equal(await verifyLockPassword(undefined, hash), false);
  assert.equal(await verifyLockPassword(12345678, hash), false);
});

test("verifyLockPassword rejects malformed or tampered hashes without throwing", async () => {
  const hash = await hashLockPassword("correct horse battery");
  const parts = hash.split("$");
  assert.equal(await verifyLockPassword("correct horse battery", "not-a-hash"), false);
  assert.equal(await verifyLockPassword("correct horse battery", ""), false);
  // Inflated cost parameters are refused, not computed.
  const expensive = ["scrypt", String(1 << 24), ...parts.slice(2)].join("$");
  assert.equal(await verifyLockPassword("correct horse battery", expensive), false);
  // A truncated hash can't match.
  const short = [...parts.slice(0, 5), parts[5].slice(0, 10)].join("$");
  assert.equal(await verifyLockPassword("correct horse battery", short), false);
});

test("lockPasswordProblem enforces the minimum length", () => {
  assert.ok(lockPasswordProblem("short"));
  assert.ok(lockPasswordProblem("x".repeat(LOCK_PASSWORD_MIN_LENGTH - 1)));
  assert.equal(lockPasswordProblem("x".repeat(LOCK_PASSWORD_MIN_LENGTH)), null);
  assert.ok(lockPasswordProblem(" ".repeat(LOCK_PASSWORD_MIN_LENGTH)));
  assert.ok(lockPasswordProblem("x".repeat(1000)));
  assert.ok(lockPasswordProblem(undefined));
});

// ── Unlock cookie ──────────────────────────────────────────────────

function token(overrides: Partial<{ schoolId: string; userId: string; version: string; expiresAt: number }> = {}, key = KEY) {
  return signUnlockToken(
    {
      schoolId: SCHOOL,
      userId: USER,
      version: "v-current",
      expiresAt: Date.now() + UNLOCK_TTL_MS,
      ...overrides,
    },
    key
  );
}

const expected = { schoolId: SCHOOL, userId: USER, version: "v-current" };

test("a signed unlock token verifies for its school, user and version", () => {
  assert.equal(verifyUnlockToken(token(), expected, KEY), true);
});

test("an unlock token doesn't carry over to another school or user", () => {
  assert.equal(verifyUnlockToken(token(), { ...expected, schoolId: OTHER_SCHOOL }, KEY), false);
  assert.equal(verifyUnlockToken(token(), { ...expected, userId: OTHER_USER }, KEY), false);
});

test("an unlock token expires", () => {
  const now = Date.now();
  const t = token({ expiresAt: now + 1000 });
  assert.equal(verifyUnlockToken(t, { ...expected, now }, KEY), true);
  assert.equal(verifyUnlockToken(t, { ...expected, now: now + 1000 }, KEY), false);
  assert.equal(verifyUnlockToken(token({ expiresAt: now - 1 }), { ...expected, now }, KEY), false);
  // Longer than we ever issue: refused.
  assert.equal(verifyUnlockToken(token({ expiresAt: now + UNLOCK_TTL_MS * 2 }), { ...expected, now }, KEY), false);
});

test("changing or re-setting the password invalidates outstanding unlocks", async () => {
  const oldHash = await hashLockPassword("first password");
  const newHash = await hashLockPassword("first password"); // same password, new salt
  const t = token({ version: lockVersion(oldHash, KEY) });
  assert.equal(verifyUnlockToken(t, { ...expected, version: lockVersion(oldHash, KEY) }, KEY), true);
  assert.equal(verifyUnlockToken(t, { ...expected, version: lockVersion(newHash, KEY) }, KEY), false);
  assert.ok(!lockVersion(oldHash, KEY).includes(oldHash));
});

test("a forged or tampered unlock token is rejected", () => {
  const otherKey = unlockSigningKey({ SCHOOL_LOCK_SECRET: "other-secret" })!;
  assert.equal(verifyUnlockToken(token({}, otherKey), expected, KEY), false);

  const [v, payload, sig] = token().split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  claims.u = OTHER_USER;
  const swapped = Buffer.from(JSON.stringify(claims)).toString("base64url");
  assert.equal(verifyUnlockToken(`${v}.${swapped}.${sig}`, { ...expected, userId: OTHER_USER }, KEY), false);

  for (const bad of [null, undefined, "", "garbage", "v1.a.b", `v2.${payload}.${sig}`, `${v}.${payload}.`]) {
    assert.equal(verifyUnlockToken(bad, expected, KEY), false);
  }
});

test("unlock signing key comes from an existing server secret", () => {
  assert.equal(unlockSigningKey({}), null);
  assert.ok(unlockSigningKey({ SUPABASE_SERVICE_ROLE_KEY: "service" }));
  // Derived, not the raw secret.
  assert.notEqual(unlockSigningKey({ SCHOOL_LOCK_SECRET: "abc" })!.toString(), "abc");
  assert.notDeepEqual(
    unlockSigningKey({ SCHOOL_LOCK_SECRET: "abc" }),
    unlockSigningKey({ SCHOOL_LOCK_SECRET: "abd" })
  );
});

test("unlock cookies are per school", () => {
  assert.notEqual(unlockCookieName(SCHOOL), unlockCookieName(OTHER_SCHOOL));
  assert.match(unlockCookieName(SCHOOL), /^ams_unlock_[a-f0-9-]+$/);
  assert.equal(unlockCookieName("x;y=z"), "ams_unlock_xyz");
});

// ── Rate limit ─────────────────────────────────────────────────────

test("unlockRateLimit allows up to the limit of failures in the window", () => {
  const now = 10_000_000;
  const fails = (n: number) => Array.from({ length: n }, (_, i) => now - (i + 1) * 1000);
  assert.deepEqual(unlockRateLimit([], now), { allowed: true });
  assert.deepEqual(unlockRateLimit(fails(UNLOCK_MAX_FAILED_ATTEMPTS - 1), now), { allowed: true });
  const blocked = unlockRateLimit(fails(UNLOCK_MAX_FAILED_ATTEMPTS), now);
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) {
    assert.equal(blocked.retryAt, now - UNLOCK_MAX_FAILED_ATTEMPTS * 1000 + UNLOCK_ATTEMPT_WINDOW_MS);
  }
});

test("unlockRateLimit forgets failures older than the window", () => {
  const now = 10_000_000;
  const old = Array.from({ length: 20 }, (_, i) => now - UNLOCK_ATTEMPT_WINDOW_MS - i);
  assert.deepEqual(unlockRateLimit(old, now), { allowed: true });
  const mixed = [...old, now - 1, now - 2];
  assert.deepEqual(unlockRateLimit(mixed, now), { allowed: true });
});

// ── Access decision ────────────────────────────────────────────────

const base: SchoolAccessInput = {
  isSuperAdmin: false,
  membership: null,
  need: "admin",
  locked: true,
  unlocked: false,
};

test("the school's own admins are never locked out", () => {
  const admin = { role: "admin", approved: true };
  assert.equal(decideSchoolAccess({ ...base, membership: admin }), "allow");
  assert.equal(decideSchoolAccess({ ...base, membership: admin, need: "member" }), "allow");
  // Even a super-admin who is also a genuine admin of this school.
  assert.equal(decideSchoolAccess({ ...base, membership: admin, isSuperAdmin: true }), "allow");
});

test("parents keep parent-level access to a locked school", () => {
  const parent = { role: "parent", approved: true };
  assert.equal(decideSchoolAccess({ ...base, membership: parent, need: "member" }), "allow");
  assert.equal(decideSchoolAccess({ ...base, membership: parent, need: "admin" }), "deny");
  assert.equal(
    decideSchoolAccess({ ...base, membership: { role: "parent", approved: false }, need: "member" }),
    "deny"
  );
});

test("a super-admin is locked out of a locked school until it's unlocked", () => {
  const superAdmin = { ...base, isSuperAdmin: true };
  assert.equal(decideSchoolAccess(superAdmin), "locked");
  assert.equal(decideSchoolAccess({ ...superAdmin, need: "member" }), "locked");
  assert.equal(decideSchoolAccess({ ...superAdmin, unlocked: true }), "allow");
  assert.equal(decideSchoolAccess({ ...superAdmin, locked: false }), "allow");
  // A parent membership doesn't open admin pages for them.
  assert.equal(
    decideSchoolAccess({ ...superAdmin, membership: { role: "parent", approved: true } }),
    "locked"
  );
});

test("non-members are never 'locked' (that's only for super-admins)", () => {
  assert.equal(decideSchoolAccess(base), "deny");
  assert.equal(decideSchoolAccess({ ...base, locked: false }), "deny");
  for (const locked of [true, false]) {
    for (const unlocked of [true, false]) {
      for (const need of ["admin", "member"] as const) {
        assert.notEqual(decideSchoolAccess({ ...base, locked, unlocked, need }), "locked");
      }
    }
  }
});

test("hasGenuineAccess requires an approved membership", () => {
  assert.equal(hasGenuineAccess(null, "member"), false);
  assert.equal(hasGenuineAccess({ role: "admin", approved: false }, "admin"), false);
  assert.equal(hasGenuineAccess({ role: "admin", approved: true }, "admin"), true);
  assert.equal(hasGenuineAccess({ role: "parent", approved: true }, "admin"), false);
  assert.equal(hasGenuineAccess({ role: "parent", approved: true }, "member"), true);
});
