import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFollowUps } from "./chat-utils";

const CHIPS = "1. When is pickup?\n2. Is there a bus?\n3. Who is the nurse?";

test("parseFollowUps: no NOT_FOUND line → notFound false", () => {
  const out = parseFollowUps(`Classes start at 8:30 [1].\n\n---FOLLOW_UPS---\n${CHIPS}`);
  assert.equal(out.notFound, false);
  assert.equal(out.content, "Classes start at 8:30 [1].");
  assert.equal(out.followUps.length, 3);
});

test("parseFollowUps: NOT_FOUND in the follow-up block sets the flag and is not a chip", () => {
  const out = parseFollowUps(`I couldn't find that.\n\n---FOLLOW_UPS---\nNOT_FOUND\n${CHIPS}`);
  assert.equal(out.notFound, true);
  assert.equal(out.content, "I couldn't find that.");
  assert.deepEqual(out.followUps, ["When is pickup?", "Is there a bus?", "Who is the nurse?"]);
});

test("parseFollowUps: tolerates decoration and a marker misplaced at the end of the answer", () => {
  assert.equal(parseFollowUps(`Nope.\n---FOLLOW_UPS---\n**NOT_FOUND**\n${CHIPS}`).notFound, true);
  const misplaced = parseFollowUps(`I couldn't find that.\nNOT_FOUND\n---FOLLOW_UPS---\n${CHIPS}`);
  assert.equal(misplaced.notFound, true);
  assert.equal(misplaced.content, "I couldn't find that.");
});

test("parseFollowUps: prose mentioning 'not found' is not the flag", () => {
  const out = parseFollowUps(`The lost and found is not found in the handbook.\n---FOLLOW_UPS---\n${CHIPS}`);
  assert.equal(out.notFound, false);
});
