import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldPromptForChildren } from "./children-prompt";

const parentWithNoKids = {
  role: "parent" as const,
  isSuperAdmin: false,
  childCount: 0,
  skippedThisSession: false,
};

test("prompts a parent with no children", () => {
  assert.equal(shouldPromptForChildren(parentWithNoKids), true);
});

test("doesn't prompt a parent who has children", () => {
  assert.equal(shouldPromptForChildren({ ...parentWithNoKids, childCount: 1 }), false);
  assert.equal(shouldPromptForChildren({ ...parentWithNoKids, childCount: 3 }), false);
});

test("doesn't prompt again once skipped this session", () => {
  assert.equal(
    shouldPromptForChildren({ ...parentWithNoKids, skippedThisSession: true }),
    false
  );
});

test("never prompts admins or super admins", () => {
  assert.equal(shouldPromptForChildren({ ...parentWithNoKids, role: "admin" }), false);
  assert.equal(
    shouldPromptForChildren({ ...parentWithNoKids, role: "admin", isSuperAdmin: true }),
    false
  );
  assert.equal(shouldPromptForChildren({ ...parentWithNoKids, isSuperAdmin: true }), false);
});
