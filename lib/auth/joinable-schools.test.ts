import { test } from "node:test";
import assert from "node:assert/strict";
import { partitionJoinableSchools } from "./joinable-schools";
import type { SignInSchool } from "./sign-in-schools";

function school(id: string, name = id): SignInSchool {
  return { id, name, slug: id, logoUrl: null, provider: "blackbaud" };
}

const SCHOOLS = [school("collegiate"), school("st-christophers"), school("trinity")];

test("drops schools the user already belongs to", () => {
  const result = partitionJoinableSchools(SCHOOLS, [
    { school_id: "collegiate", approved: true },
  ]);
  assert.deepEqual(
    result.available.map((s) => s.id),
    ["st-christophers", "trinity"]
  );
  assert.deepEqual(result.pending, []);
});

test("keeps pending memberships apart from available schools", () => {
  const result = partitionJoinableSchools(SCHOOLS, [
    { school_id: "trinity", approved: false },
    { school_id: "st-christophers", approved: null },
  ]);
  assert.deepEqual(result.available.map((s) => s.id), ["collegiate"]);
  assert.deepEqual(
    result.pending.map((s) => s.id),
    ["st-christophers", "trinity"]
  );
});

test("nothing left when the user is in every school", () => {
  const result = partitionJoinableSchools(
    SCHOOLS,
    SCHOOLS.map((s) => ({ school_id: s.id, approved: true }))
  );
  assert.deepEqual(result, { available: [], pending: [] });
});

test("no memberships offers every school, in order", () => {
  const result = partitionJoinableSchools(SCHOOLS, []);
  assert.deepEqual(result.available, SCHOOLS);
});

test("memberships in schools without sign-in are ignored", () => {
  const result = partitionJoinableSchools(SCHOOLS, [
    { school_id: "elsewhere", approved: true },
  ]);
  assert.equal(result.available.length, 3);
});
