import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  APP_CALLBACK_URL,
  appCallbackUrl,
  challengeForVerifier,
  hashHandoffCode,
  isValidAppChallenge,
  newHandoffCode,
  verifierMatchesChallenge,
} from "./app-handoff";
import { createLoginState, verifyLoginState } from "../blackbaud/state";

process.env.BLACKBAUD_TOKEN_ENC_KEY = crypto.randomBytes(32).toString("base64");

const VERIFIER = crypto.randomBytes(32).toString("base64url");

test("the challenge is the base64url SHA-256 of the verifier", () => {
  const expected = crypto.createHash("sha256").update(VERIFIER).digest("base64url");
  assert.equal(challengeForVerifier(VERIFIER), expected);
});

test("a verifier matches only its own challenge", () => {
  const challenge = challengeForVerifier(VERIFIER);
  const other = crypto.randomBytes(32).toString("base64url");

  assert.equal(verifierMatchesChallenge(VERIFIER, challenge), true);
  assert.equal(verifierMatchesChallenge(other, challenge), false);
  assert.equal(verifierMatchesChallenge("", challenge), false);
});

test("only a 43-character base64url string is a valid challenge", () => {
  assert.equal(isValidAppChallenge(challengeForVerifier(VERIFIER)), true);
  assert.equal(isValidAppChallenge("short"), false);
  assert.equal(isValidAppChallenge(`${"a".repeat(42)}=`), false);
  assert.equal(isValidAppChallenge(null), false);
});

test("handoff codes are random and stored only as a hash", () => {
  const a = newHandoffCode();
  const b = newHandoffCode();

  assert.notEqual(a, b);
  assert.ok(a.length >= 43);
  assert.notEqual(hashHandoffCode(a), a);
  assert.equal(hashHandoffCode(a), hashHandoffCode(a));
});

test("the app callback URL carries a code or an error, never both", () => {
  const withCode = new URL(appCallbackUrl({ code: "abc" }));
  assert.equal(`${withCode.protocol}//${withCode.host}`, APP_CALLBACK_URL);
  assert.equal(withCode.searchParams.get("code"), "abc");
  assert.equal(withCode.searchParams.get("error"), null);

  const withError = new URL(appCallbackUrl({ error: "Nope & no", school: "demo" }));
  assert.equal(withError.searchParams.get("error"), "Nope & no");
  assert.equal(withError.searchParams.get("school"), "demo");
  assert.equal(withError.searchParams.get("code"), null);
});

test("a login state carries the app challenge through verification", () => {
  const challenge = challengeForVerifier(VERIFIER);
  const state = createLoginState("school-uuid", "acme", challenge);

  assert.equal(verifyLoginState(state, state)?.appChallenge, challenge);
});

test("a browser login state has no app challenge", () => {
  const state = createLoginState("school-uuid", "acme");
  const verified = verifyLoginState(state, state);

  assert.ok(verified);
  assert.equal(verified.appChallenge, undefined);
});
