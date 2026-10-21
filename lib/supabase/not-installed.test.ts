import test from "node:test";
import assert from "node:assert/strict";
import { isNotInstalledError } from "./not-installed";

test("missing table / column errors mean the feature isn't installed", () => {
  assert.equal(isNotInstalledError({ code: "42P01", message: 'relation "school_roster" does not exist' }), true);
  assert.equal(isNotInstalledError({ code: "42703", message: "column schools.require_roster_match does not exist" }), true);
  assert.equal(isNotInstalledError({ code: "PGRST204", message: "Could not find the 'x' column" }), true);
  assert.equal(isNotInstalledError({ code: "PGRST205", message: "Could not find the table 'public.school_roster'" }), true);
  assert.equal(isNotInstalledError({ message: "Could not find the table 'public.parent_login_codes' in the schema cache" }), true);
});

test("a missing RPC function means the feature isn't installed", () => {
  assert.equal(isNotInstalledError({ code: "42883", message: "function public.find_conflict_candidates(uuid) does not exist" }), true);
  assert.equal(isNotInstalledError({ code: "PGRST202", message: "Could not find the function public.find_conflict_candidates in the schema cache" }), true);
  assert.equal(isNotInstalledError({ message: "Could not find the function public.find_conflict_candidates(p_school_id) in the schema cache" }), true);
});

test("every other error is a real error", () => {
  assert.equal(isNotInstalledError(null), false);
  assert.equal(isNotInstalledError(undefined), false);
  assert.equal(isNotInstalledError({ code: "23514", message: "violates check constraint" }), false);
  assert.equal(isNotInstalledError({ code: "23505", message: "duplicate key" }), false);
  assert.equal(isNotInstalledError({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }), false);
  // A coded error is judged by its code, not by wording in the message.
  assert.equal(isNotInstalledError({ code: "XX000", message: "thing does not exist" }), false);
  assert.equal(isNotInstalledError({ message: "fetch failed" }), false);
});
