import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  ICS_TOKEN_TTL_MS,
  icsSigningKey,
  issueIcsToken,
  signIcsToken,
  verifyIcsToken,
} from "./ics-token";

const KEY = crypto.randomBytes(32);
const USER = "user-1";
const EVENT = "11111111-2222-3333-4444-555555555555";
const OTHER_EVENT = "99999999-2222-3333-4444-555555555555";
const NOW = 1_800_000_000_000;

test("a fresh token verifies for its event and names its user", () => {
  const token = issueIcsToken(USER, EVENT, KEY, NOW);
  assert.deepEqual(verifyIcsToken(token, { eventId: EVENT, now: NOW + 1000 }, KEY), { userId: USER });
});

test("a token expires after the TTL", () => {
  const token = issueIcsToken(USER, EVENT, KEY, NOW);
  assert.ok(verifyIcsToken(token, { eventId: EVENT, now: NOW + ICS_TOKEN_TTL_MS - 1 }, KEY));
  assert.equal(verifyIcsToken(token, { eventId: EVENT, now: NOW + ICS_TOKEN_TTL_MS }, KEY), null);
  assert.equal(verifyIcsToken(token, { eventId: EVENT, now: NOW + 60 * 60 * 1000 }, KEY), null);
});

test("a token for one event doesn't open another", () => {
  const token = issueIcsToken(USER, EVENT, KEY, NOW);
  assert.equal(verifyIcsToken(token, { eventId: OTHER_EVENT, now: NOW }, KEY), null);
});

test("a tampered payload or signature is rejected", () => {
  const token = issueIcsToken(USER, EVENT, KEY, NOW);
  const [version, payload, signature] = token.split(".");

  const forged = Buffer.from(
    JSON.stringify({ u: "someone-else", ev: EVENT, e: NOW + ICS_TOKEN_TTL_MS })
  ).toString("base64url");
  assert.equal(verifyIcsToken(`${version}.${forged}.${signature}`, { eventId: EVENT, now: NOW }, KEY), null);

  const flipped = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
  assert.equal(verifyIcsToken(`${version}.${payload}.${flipped}`, { eventId: EVENT, now: NOW }, KEY), null);
  assert.equal(verifyIcsToken(`v2.${payload}.${signature}`, { eventId: EVENT, now: NOW }, KEY), null);
  assert.equal(verifyIcsToken(`${payload}.${signature}`, { eventId: EVENT, now: NOW }, KEY), null);
});

test("a token signed with another key is rejected", () => {
  const token = issueIcsToken(USER, EVENT, crypto.randomBytes(32), NOW);
  assert.equal(verifyIcsToken(token, { eventId: EVENT, now: NOW }, KEY), null);
});

test("a validly signed token claiming a longer life than we issue is rejected", () => {
  const token = signIcsToken({ userId: USER, eventId: EVENT, expiresAt: NOW + 24 * 60 * 60 * 1000 }, KEY);
  assert.equal(verifyIcsToken(token, { eventId: EVENT, now: NOW }, KEY), null);
});

test("missing, empty and junk tokens are rejected", () => {
  for (const token of [null, undefined, "", "junk", "v1..", "v1.%%%.%%%", "x".repeat(2000)]) {
    assert.equal(verifyIcsToken(token, { eventId: EVENT, now: NOW }, KEY), null);
  }
  const noUser = signIcsToken({ userId: "", eventId: EVENT, expiresAt: NOW + 1000 }, KEY);
  assert.equal(verifyIcsToken(noUser, { eventId: EVENT, now: NOW }, KEY), null);
});

test("the signing key comes from the service-role key, with its own label", () => {
  assert.equal(icsSigningKey({}), null);
  const a = icsSigningKey({ SUPABASE_SERVICE_ROLE_KEY: "secret" });
  const b = icsSigningKey({ SUPABASE_SERVICE_ROLE_KEY: "secret" });
  assert.ok(a && b && a.equals(b));
  // Not the raw secret, and not the school-lock key derived from the same secret.
  assert.equal(a!.equals(Buffer.from("secret")), false);
  const lockKey = crypto.createHmac("sha256", "secret").update("ams:school-owner-lock:v1").digest();
  assert.equal(a!.equals(lockKey), false);
});
