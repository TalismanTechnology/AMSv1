import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidWallToken } from "./token";

test("isValidWallToken accepts only the configured token", () => {
  process.env.WALL_TOKEN = "s3cret-wall-token";
  assert.equal(isValidWallToken("s3cret-wall-token"), true);
  assert.equal(isValidWallToken("s3cret-wall-tokeN"), false);
  assert.equal(isValidWallToken("s3cret"), false);
  assert.equal(isValidWallToken("s3cret-wall-token-and-more"), false);
});

test("isValidWallToken rejects a missing token", () => {
  process.env.WALL_TOKEN = "s3cret-wall-token";
  assert.equal(isValidWallToken(null), false);
  assert.equal(isValidWallToken(undefined), false);
  assert.equal(isValidWallToken(""), false);
});

test("isValidWallToken rejects everything when WALL_TOKEN is unset or empty", () => {
  delete process.env.WALL_TOKEN;
  assert.equal(isValidWallToken("anything"), false);
  assert.equal(isValidWallToken(""), false);
  process.env.WALL_TOKEN = "";
  assert.equal(isValidWallToken(""), false);
  assert.equal(isValidWallToken("anything"), false);
});
