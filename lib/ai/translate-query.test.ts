import test from "node:test";
import assert from "node:assert/strict";

import { TRANSLATE_TIMEOUT_MS, translateQueryToEnglish, translationPrompt } from "./translate-query";

type Call = Record<string, unknown>;

function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const warn = console.warn;
  console.warn = () => {};
  return fn().finally(() => {
    console.warn = warn;
  });
}

test("a Spanish question comes back as an English search query", async () => {
  const calls: Call[] = [];
  const result = await translateQueryToEnglish("¿Cuándo son las vacaciones de invierno?", {
    generate: async (options) => {
      calls.push(options as unknown as Call);
      return { text: "When is winter break?\n", finishReason: "stop" };
    },
  });
  assert.deepEqual(result, { query: "When is winter break?", translated: true });
  assert.equal(calls.length, 1);
});

test("the call uses thinkingBudget 0 (never thinkingLevel minimal), temperature 0, a timeout signal", async () => {
  let seen: Call | undefined;
  await translateQueryToEnglish("¿Hay clases el viernes?", {
    modelId: "gemini-3.8-flash",
    generate: async (options) => {
      seen = options as unknown as Call;
      return { text: "Is there school on Friday?", finishReason: "stop" };
    },
  });
  assert.deepEqual(seen?.providerOptions, { google: { thinkingConfig: { thinkingBudget: 0 } } });
  assert.doesNotMatch(JSON.stringify(seen?.providerOptions), /thinkingLevel|minimal/);
  assert.equal(seen?.temperature, 0);
  assert.ok(seen?.abortSignal instanceof AbortSignal);
  assert.equal(TRANSLATE_TIMEOUT_MS, 2500);
});

test("a provider error falls back to the original text, never throws", async () => {
  const result = await quiet(() =>
    translateQueryToEnglish("¿Cuál es el horario?", {
      generate: async () => {
        throw new Error("503 Service Unavailable");
      },
    })
  );
  assert.deepEqual(result, { query: "¿Cuál es el horario?", translated: false });
});

test("a slow call times out to the original text and is aborted", async () => {
  let signal: AbortSignal | undefined;
  const started = Date.now();
  const result = await quiet(() =>
    translateQueryToEnglish("¿Cuál es el horario?", {
      timeoutMs: 30,
      generate: (options) => {
        signal = (options as unknown as Call).abortSignal as AbortSignal;
        // Never settles on its own.
        return new Promise(() => {});
      },
    })
  );
  assert.deepEqual(result, { query: "¿Cuál es el horario?", translated: false });
  assert.ok(Date.now() - started < 1000);
  assert.equal(signal?.aborted, true);
});

test("truncated or unusable output falls back to the original text", async () => {
  for (const output of [
    { text: "When is the", finishReason: "length" },
    { text: "  ", finishReason: "stop" },
    { text: "x".repeat(500), finishReason: "stop" },
  ]) {
    const result = await quiet(() =>
      translateQueryToEnglish("¿Cuándo es la graduación?", { generate: async () => output })
    );
    assert.deepEqual(result, { query: "¿Cuándo es la graduación?", translated: false });
  }
});

test("the prompt keeps names, dates and redacted child labels as written", () => {
  const prompt = translationPrompt("¿[your 8th Grade child] tiene clases el 5 de enero?");
  assert.match(prompt, /\[your 8th Grade child\] tiene clases el 5 de enero/);
  assert.match(prompt, /Return ONLY the English translation/);
  assert.match(prompt, /names of people, places, programs, events and rooms/);
  assert.match(prompt, /square brackets/);
});
