import { test } from "node:test";
import assert from "node:assert/strict";
import { locateChunk, locateHighlight, snapToSentence } from "./locate";

test("exact substring match", () => {
  assert.deepEqual(locateChunk("abc def ghi", "def"), [4, 7]);
});

test("matches a whitespace-collapsed chunk across newlines", () => {
  const full = "Arrival\n\nDoors open at 7:45\neach morning.\n\nLunch is at noon.";
  const range = locateChunk(full, "Doors open at 7:45 each morning.");
  assert.ok(range);
  assert.equal(full.slice(range[0], range[1]), "Doors open at 7:45\neach morning.");
});

test("tolerates a trailing ellipsis and case drift", () => {
  const full = "Pickup\nstarts at 3:15 PM sharp.";
  const range = locateChunk(full, "pickup starts at 3:15 pm…");
  assert.ok(range);
  assert.equal(full.slice(range[0], range[1]), "Pickup\nstarts at 3:15 PM");
});

test("snapToSentence expands to sentence bounds", () => {
  const full = "First one. Second sentence here. Third.";
  const start = full.indexOf("cond");
  assert.deepEqual(
    full.slice(...snapToSentence(full, start, start + 4)),
    "Second sentence here."
  );
});

test("locateHighlight returns null for missing chunks", () => {
  assert.equal(locateHighlight("abc", "zzz not here"), null);
  assert.equal(locateHighlight("abc", null), null);
});
