import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSchoolName, schoolPossessive } from "./school-display-name";

test("resolveSchoolName picks the first real name", () => {
  assert.equal(resolveSchoolName("Collegiate", "Other"), "Collegiate");
  assert.equal(resolveSchoolName("  ", "Collegiate"), "Collegiate");
  assert.equal(resolveSchoolName(null, undefined, " Collegiate "), "Collegiate");
});

test("resolveSchoolName ignores the product-name default", () => {
  assert.equal(resolveSchoolName("", "AskMySchool"), null);
  assert.equal(resolveSchoolName(null, "askmyschool"), null);
});

test("schoolPossessive falls back to a neutral phrase", () => {
  assert.equal(schoolPossessive("Collegiate"), "Collegiate's");
  assert.equal(schoolPossessive("St. James"), "St. James'");
  assert.equal(schoolPossessive(""), "your school's");
  assert.equal(schoolPossessive("   "), "your school's");
  assert.equal(schoolPossessive(null), "your school's");
});
