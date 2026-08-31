import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { decryptToken, encryptToken, normalizeEmail } from "./crypto";
import { createOAuthState, verifyOAuthState } from "./state";

// Both modules read this at call time rather than import time, so setting it
// here is enough — no dynamic import needed.
process.env.BLACKBAUD_TOKEN_ENC_KEY = crypto.randomBytes(32).toString("base64");

test("encrypted token round-trips", () => {
  const secret = "refresh-token-abc123";
  const decrypted = decryptToken(encryptToken(secret));
  assert.equal(decrypted, secret);
});

test("each encryption uses a fresh IV", () => {
  const a = encryptToken("same-input");
  const b = encryptToken("same-input");
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

test("tampered ciphertext is rejected, not silently decrypted", () => {
  const encrypted = encryptToken("refresh-token-abc123");
  const bytes = Buffer.from(encrypted.ciphertext, "base64");
  bytes[0] ^= 0xff;

  assert.throws(() =>
    decryptToken({ ...encrypted, ciphertext: bytes.toString("base64") })
  );
});

test("tampered auth tag is rejected", () => {
  const encrypted = encryptToken("refresh-token-abc123");
  const bytes = Buffer.from(encrypted.tag, "base64");
  bytes[0] ^= 0xff;

  assert.throws(() =>
    decryptToken({ ...encrypted, tag: bytes.toString("base64") })
  );
});

test("emails normalize consistently across casing and whitespace", () => {
  assert.equal(normalizeEmail("  Parent@School.ORG "), "parent@school.org");
});

test("valid state verifies when the cookie matches", () => {
  const state = createOAuthState("school-uuid", "acme");
  const verified = verifyOAuthState(state, state);

  assert.equal(verified?.schoolId, "school-uuid");
  assert.equal(verified?.schoolSlug, "acme");
});

test("valid state is rejected without the binding cookie", () => {
  const state = createOAuthState("school-uuid", "acme");
  assert.equal(verifyOAuthState(state, undefined), null);
});

test("state is rejected when the cookie is for a different flow", () => {
  // The confused-deputy case: attacker presents a state they legitimately
  // minted for their own school, but this browser was never issued it.
  const attackerState = createOAuthState("attacker-school", "attacker");
  const victimState = createOAuthState("victim-school", "victim");

  assert.equal(verifyOAuthState(attackerState, victimState), null);
});

test("forged signature is rejected even with a matching cookie", () => {
  const state = createOAuthState("school-uuid", "acme");
  const [payload] = state.split(".");
  const forged = `${payload}.${Buffer.from("not-a-real-signature").toString("base64url")}`;

  assert.equal(verifyOAuthState(forged, forged), null);
});

test("payload tampering invalidates the signature", () => {
  const state = createOAuthState("school-uuid", "acme");
  const [, signature] = state.split(".");
  const swapped = Buffer.from(
    JSON.stringify({
      schoolId: "other-school",
      schoolSlug: "other",
      issuedAt: Date.now(),
    })
  ).toString("base64url");

  assert.equal(verifyOAuthState(`${swapped}.${signature}`, `${swapped}.${signature}`), null);
});

test("expired state is rejected", () => {
  const stale = Buffer.from(
    JSON.stringify({
      schoolId: "school-uuid",
      schoolSlug: "acme",
      issuedAt: Date.now() - 11 * 60 * 1000,
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", Buffer.from(process.env.BLACKBAUD_TOKEN_ENC_KEY!, "base64"))
    .update(stale)
    .digest("base64url");

  const state = `${stale}.${signature}`;
  assert.equal(verifyOAuthState(state, state), null);
});
