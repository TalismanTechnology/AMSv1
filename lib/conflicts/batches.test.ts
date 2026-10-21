import { test } from "node:test";
import assert from "node:assert/strict";
import { callSplittingOnTimeout, isStatementTimeout, packByChunkCount } from "./batches";

const TIMEOUT = { code: "57014", message: "canceling statement due to statement timeout" };

test("packByChunkCount packs consecutive documents up to the chunk limit", () => {
  const counts = new Map([
    ["a", 20],
    ["b", 30],
    ["c", 15],
    ["d", 5],
    ["e", 60],
  ]);
  assert.deepEqual(packByChunkCount(["a", "b", "c", "d", "e"], counts, 60), [["a", "b"], ["c", "d"], ["e"]]);
});

test("packByChunkCount gives a large document its own batch", () => {
  const counts = new Map([
    ["small", 3],
    ["handbook", 400],
    ["notice", 2],
  ]);
  assert.deepEqual(packByChunkCount(["small", "handbook", "notice"], counts, 60), [
    ["small"],
    ["handbook"],
    ["notice"],
  ]);
});

test("packByChunkCount counts documents without chunks as none", () => {
  const counts = new Map([["a", 60]]);
  assert.deepEqual(packByChunkCount(["x", "a", "y", "z"], counts, 60), [["x", "a", "y", "z"]]);
  assert.deepEqual(packByChunkCount([], counts, 60), []);
});

test("isStatementTimeout matches the code or the message", () => {
  assert.equal(isStatementTimeout(TIMEOUT), true);
  assert.equal(isStatementTimeout({ message: "canceling statement due to statement timeout" }), true);
  assert.equal(isStatementTimeout({ code: "42883", message: "function does not exist" }), false);
  assert.equal(isStatementTimeout(null), false);
});

/** A fake rpc that times out whenever a call includes a document in slow. */
function fakeRpc(slow: Set<string>) {
  const calls: string[][] = [];
  const call = async (ids: string[]) => {
    calls.push(ids);
    if (ids.some((id) => slow.has(id))) return { data: null, error: TIMEOUT };
    return { data: ids.map((id) => `row:${id}`), error: null };
  };
  return { calls, call };
}

test("callSplittingOnTimeout makes one call when nothing times out", async () => {
  const { calls, call } = fakeRpc(new Set());
  const result = await callSplittingOnTimeout(["a", "b", "c"], call);
  assert.deepEqual(result, { rows: ["row:a", "row:b", "row:c"], timedOut: [], truncated: false });
  assert.equal(calls.length, 1);
});

test("callSplittingOnTimeout splits a timed-out batch and skips the slow document", async () => {
  const { calls, call } = fakeRpc(new Set(["c"]));
  const timeouts: string[][] = [];
  const result = await callSplittingOnTimeout(["a", "b", "c", "d"], call, { onTimeout: (ids) => timeouts.push(ids) });
  assert.deepEqual(result.rows.sort(), ["row:a", "row:b", "row:d"]);
  assert.deepEqual(result.timedOut, ["c"]);
  assert.equal(result.truncated, false);
  assert.deepEqual(calls, [["a", "b", "c", "d"], ["a", "b"], ["c", "d"], ["c"], ["d"]]);
  assert.deepEqual(timeouts, [["a", "b", "c", "d"], ["c", "d"], ["c"]]);
});

test("callSplittingOnTimeout skips a single document that times out", async () => {
  const { call } = fakeRpc(new Set(["handbook"]));
  const result = await callSplittingOnTimeout(["handbook"], call);
  assert.deepEqual(result, { rows: [], timedOut: ["handbook"], truncated: false });
});

test("callSplittingOnTimeout throws other errors", async () => {
  const error = { code: "XX000", message: "boom" };
  await assert.rejects(
    callSplittingOnTimeout(["a", "b"], async () => ({ data: null, error })),
    (err) => err === error
  );
});

test("callSplittingOnTimeout stops splitting once expired", async () => {
  const { calls, call } = fakeRpc(new Set(["a"]));
  const result = await callSplittingOnTimeout(["a", "b"], call, { expired: () => true });
  assert.deepEqual(result, { rows: [], timedOut: [], truncated: true });
  assert.equal(calls.length, 1);
});
