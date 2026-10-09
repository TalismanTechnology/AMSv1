import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  AI_CONSENT_REQUIRED_CODE,
  AI_CONSENT_VERSION,
  aiConsentGate,
  consentGrantedFields,
  consentRevokedFields,
  hasAiConsent,
  isAiConsentError,
} from "./consent";

test("no profile, or a profile that never agreed, has no consent", () => {
  assert.equal(hasAiConsent(null), false);
  assert.equal(hasAiConsent(undefined), false);
  assert.equal(hasAiConsent({}), false);
  assert.equal(hasAiConsent({ ai_consent_at: null, ai_consent_version: null }), false);
});

test("consent to an older notice version does not count", () => {
  assert.equal(
    hasAiConsent({ ai_consent_at: "2026-01-01T00:00:00Z", ai_consent_version: "2025-01-01" }),
    false
  );
  // A version without a timestamp (half-written row) doesn't count either.
  assert.equal(hasAiConsent({ ai_consent_at: null, ai_consent_version: AI_CONSENT_VERSION }), false);
});

test("granting writes the current version; revoking clears it", () => {
  const now = new Date("2026-10-09T18:00:00Z");
  const granted = consentGrantedFields(now);
  assert.deepEqual(granted, {
    ai_consent_at: "2026-10-09T18:00:00.000Z",
    ai_consent_version: AI_CONSENT_VERSION,
  });
  assert.equal(hasAiConsent(granted), true);
  assert.equal(hasAiConsent(consentRevokedFields()), false);
});

test("the gate rejects missing consent with a 403 the client can recognise", async () => {
  const res = aiConsentGate({ ai_consent_at: null, ai_consent_version: null });
  assert.ok(res, "expected a rejection");
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("Content-Type"), "application/json");
  const text = await res.text();
  const body = JSON.parse(text);
  assert.equal(body.code, AI_CONSENT_REQUIRED_CODE);
  assert.match(body.error, /Gemini/);
  // The AI SDK hands the raw body to the client as the error message.
  assert.equal(isAiConsentError(text), true);
});

test("the gate rejects a null profile (fails closed)", () => {
  assert.equal(aiConsentGate(null)?.status, 403);
});

test("the gate lets a consented user through", () => {
  assert.equal(aiConsentGate(consentGrantedFields()), null);
});

test("other errors are not mistaken for the consent gate", () => {
  assert.equal(isAiConsentError(undefined), false);
  assert.equal(isAiConsentError('{"error":"Access denied"}'), false);
});

test("the chat route checks consent before any call to the AI provider", () => {
  const src = readFileSync(
    path.join(process.cwd(), "app/api/chat/route.ts"),
    "utf8"
  );
  const gate = src.indexOf("aiConsentGate(profile)");
  assert.ok(gate > 0, "route must call aiConsentGate(profile)");
  assert.match(
    src,
    /const consentDenied = aiConsentGate\(profile\);\s*if \(consentDenied\) return consentDenied;/
  );
  // The profile read must include the consent columns.
  assert.match(src, /select\("role, ai_consent_at, ai_consent_version"\)/);
  for (const call of ["prepareChatTurn(", "streamText(", "generateEmbedding("]) {
    const at = src.indexOf(call, src.indexOf("export async function POST"));
    assert.ok(at > gate, `${call} must come after the consent gate`);
  }
});
