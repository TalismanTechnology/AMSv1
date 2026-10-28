import test from "node:test";
import assert from "node:assert/strict";
import { APICallError, RetryError } from "ai";
import {
  AI_ERROR_CATEGORIES,
  PARENT_AI_ERROR_MESSAGE,
  adminAiErrorMessage,
  adminSafeStoredError,
  classifyAiError,
  isAiProviderError,
  rawAiErrorMessage,
} from "./provider-errors";

const CREDITS_DEPLETED =
  "Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.";

function apiError(statusCode: number | undefined, message: string, responseBody?: string) {
  return new APICallError({
    message,
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent",
    requestBodyValues: {},
    statusCode,
    responseBody,
    isRetryable: statusCode === 429 || (statusCode ?? 0) >= 500,
  });
}

test("Gemini's depleted-credits 429 is a billing/quota failure, not a rate limit", () => {
  const error = apiError(429, CREDITS_DEPLETED, '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}');
  assert.equal(classifyAiError(error), "billing_quota");
  assert.equal(isAiProviderError(error), true);
});

test("the real failure is found inside the SDK's RetryError", () => {
  const last = apiError(429, CREDITS_DEPLETED);
  const retry = new RetryError({
    message: `Failed after 3 attempts. Last error: ${CREDITS_DEPLETED}`,
    reason: "maxRetriesExceeded",
    errors: [last, last, last],
  });
  assert.equal(classifyAiError(retry), "billing_quota");
  assert.equal(isAiProviderError(retry), true);
  assert.match(rawAiErrorMessage(retry), /prepayment credits are depleted/);
});

test("quota / billing wordings", () => {
  for (const message of [
    "You exceeded your current quota, please check your plan and billing details.",
    "Quota exceeded for metric generate_content_requests",
    "Insufficient funds",
  ]) {
    assert.equal(classifyAiError(apiError(429, message)), "billing_quota", message);
  }
  assert.equal(classifyAiError(apiError(402, "Payment required")), "billing_quota");
});

test("plain 429 / RESOURCE_EXHAUSTED is a rate limit", () => {
  assert.equal(classifyAiError(apiError(429, "Too Many Requests")), "rate_limit");
  assert.equal(classifyAiError(apiError(undefined, "Resource has been exhausted", "RESOURCE_EXHAUSTED")), "rate_limit");
});

test("5xx is provider_unavailable", () => {
  assert.equal(classifyAiError(apiError(500, "Internal error encountered.")), "provider_unavailable");
  assert.equal(classifyAiError(apiError(503, "The model is overloaded. Please try again later.")), "provider_unavailable");
});

test("bad or missing keys are auth", () => {
  assert.equal(classifyAiError(apiError(400, "API key not valid. Please pass a valid API key.", "API_KEY_INVALID")), "auth");
  assert.equal(classifyAiError(apiError(403, "Permission denied")), "auth");
  const missing = new Error("Google Generative AI API key is missing. Pass it using the 'apiKey' parameter.");
  missing.name = "AI_LoadAPIKeyError";
  assert.equal(classifyAiError(missing), "auth");
  assert.equal(isAiProviderError(missing), true);
});

test("socket-level failures are network", () => {
  const cause = Object.assign(new Error("connect ECONNREFUSED 1.2.3.4:443"), { code: "ECONNREFUSED" });
  const fetchFailed = new TypeError("fetch failed", { cause });
  assert.equal(classifyAiError(fetchFailed), "network");
  assert.equal(isAiProviderError(fetchFailed), true);
});

test("anything else is unknown, and only SDK errors count as provider errors", () => {
  assert.equal(classifyAiError(new Error("duplicate key value violates unique constraint")), "unknown");
  assert.equal(isAiProviderError(new Error("duplicate key value violates unique constraint")), false);
  assert.equal(classifyAiError(apiError(400, "Bad request")), "unknown");
  assert.equal(isAiProviderError(apiError(400, "Bad request")), true);
  assert.equal(classifyAiError(undefined), "unknown");
  assert.equal(classifyAiError("weird"), "unknown");
});

test("our own timeouts and aborts are not provider failures", () => {
  const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
  assert.equal(isAiProviderError(timeout), false);
  const abort = new DOMException("This operation was aborted", "AbortError");
  assert.equal(isAiProviderError(abort), false);
});

test("the parent message is friendly and never includes provider text", () => {
  assert.equal(
    PARENT_AI_ERROR_MESSAGE,
    "Ask My School is temporarily unavailable. Please try again in a little while."
  );
  assert.doesNotMatch(PARENT_AI_ERROR_MESSAGE, /credit|billing|gemini|google|quota|error/i);
});

test("admin messages exist for every category and never name the provider", () => {
  for (const category of AI_ERROR_CATEGORIES) {
    const message = adminAiErrorMessage(category);
    assert.ok(message.length > 0, category);
    assert.doesNotMatch(message, /gemini|google|ai studio|prepayment/i, category);
  }
});

test("stored error messages are made safe for admins", () => {
  assert.equal(adminSafeStoredError(CREDITS_DEPLETED), adminAiErrorMessage("billing_quota"));
  assert.equal(adminSafeStoredError("Document not found: x"), "Document not found: x");
  assert.equal(adminSafeStoredError(null), null);
});

test("classification never throws on hostile input", () => {
  const cyclic: Record<string, unknown> = { message: 1 };
  cyclic.cause = cyclic;
  assert.equal(classifyAiError(cyclic), "unknown");
  const getterThrows = Object.defineProperty({}, "message", {
    get() {
      throw new Error("boom");
    },
  });
  assert.equal(classifyAiError(getterThrows), "unknown");
  assert.equal(typeof rawAiErrorMessage(getterThrows), "string");
});

// The bug this module exists for: the AI SDK's toUIMessageStream() sends
// error.message to the browser unless given onError. The chat route passes
// `onError: () => PARENT_AI_ERROR_MESSAGE`; this pins that it works.
test("a failing chat stream sends parents only the friendly message", async () => {
  const { streamText } = await import("ai");
  const { MockLanguageModelV3 } = await import("ai/test");
  const failing = () =>
    new MockLanguageModelV3({
      doStream: async () => {
        throw apiError(429, CREDITS_DEPLETED);
      },
    });
  async function collect(stream: ReadableStream<unknown>) {
    const parts: unknown[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return parts;
      parts.push(value);
    }
  }

  const unguarded = streamText({ model: failing(), prompt: "hi", maxRetries: 0, onError: () => {} });
  const leaked = JSON.stringify(await collect(unguarded.toUIMessageStream()));
  assert.match(leaked, /prepayment credits/, "the SDK default leaks the provider text");

  const guarded = streamText({ model: failing(), prompt: "hi", maxRetries: 0, onError: () => {} });
  const parts = await collect(guarded.toUIMessageStream({ onError: () => PARENT_AI_ERROR_MESSAGE }));
  const text = JSON.stringify(parts);
  assert.doesNotMatch(text, /prepayment|credits|AI Studio/);
  assert.ok(
    parts.some((p) => (p as { type?: string; errorText?: string }).type === "error" &&
      (p as { errorText?: string }).errorText === PARENT_AI_ERROR_MESSAGE)
  );
});
