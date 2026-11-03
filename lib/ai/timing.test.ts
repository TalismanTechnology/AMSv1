import test from "node:test";
import assert from "node:assert/strict";

import { createTimer } from "./timing";

function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("marks and spans are ms since the timer was created", () => {
  const clock = fakeClock();
  const timer = createTimer(clock.now);
  clock.advance(10.4);
  const end = timer.start("auth");
  clock.advance(20);
  end();
  timer.mark("streamStart");
  assert.deepEqual(timer.timings(), { auth: [10, 30], streamStart: 30 });
  assert.equal(timer.elapsed(), 30);
});

test("the first mark for a name wins", () => {
  const clock = fakeClock();
  const timer = createTimer(clock.now);
  clock.advance(5);
  timer.mark("firstChunk");
  clock.advance(5);
  timer.mark("firstChunk");
  assert.deepEqual(timer.timings(), { firstChunk: 5 });
});

test("observe records when a promise settles, either way, and leaves it untouched", async () => {
  const clock = fakeClock();
  const timer = createTimer(clock.now);
  let resolve!: (v: string) => void;
  let reject!: (e: Error) => void;
  const ok = new Promise<string>((r) => (resolve = r));
  const bad = new Promise<string>((_, r) => (reject = r));
  timer.observe("ok", ok);
  timer.observe("bad", bad);
  clock.advance(7);
  resolve("value");
  reject(new Error("boom"));
  assert.equal(await ok, "value");
  await assert.rejects(bad, /boom/);
  assert.deepEqual(timer.timings(), { ok: [0, 7], bad: [0, 7] });
});

test("the log line is produced once, with the timings", () => {
  const clock = fakeClock();
  const timer = createTimer(clock.now);
  clock.advance(3);
  timer.mark("finish");
  timer.note("rewriteCalled", false);
  const line = timer.line({ outcome: "finish", sources: 2 });
  assert.ok(line?.startsWith("[chat-timing] "));
  assert.deepEqual(JSON.parse(line!.slice("[chat-timing] ".length)), {
    rewriteCalled: false,
    outcome: "finish",
    sources: 2,
    t: { finish: 3 },
  });
  assert.equal(timer.line({ outcome: "error" }), null);
});
