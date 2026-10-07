import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STARTER_CATEGORIES,
  WHOLE_SCHOOL,
  candidateCategories,
  categoryLabels,
  fallbackCategory,
  groupCategories,
  hasDivisionCategories,
} from "./division-categories";

const divisions = [
  { id: "upper", name: "Upper School", sort_order: 2 },
  { id: "lower", name: "Lower School", sort_order: 0 },
  { id: "middle", name: "Middle School", sort_order: 1 },
];

const categories = [
  { id: "u-other", name: "Other", division_id: "upper", sort_order: 6 },
  { id: "u-ath", name: "Athletics", division_id: "upper", sort_order: 1 },
  { id: "u-aca", name: "Academics", division_id: "upper", sort_order: 0 },
  { id: "l-aca", name: "Academics", division_id: "lower", sort_order: 0 },
  { id: "l-other", name: "Other", division_id: "lower", sort_order: 6 },
  { id: "w-aca", name: "Academics", division_id: null, sort_order: 0 },
  { id: "w-other", name: "Other", division_id: null, sort_order: 6 },
];

test("starts every group with six categories and Other", () => {
  assert.equal(STARTER_CATEGORIES.length, 5);
  assert.equal(STARTER_CATEGORIES[STARTER_CATEGORIES.length - 1].name, "Other");
});

test("groups categories by division in calendar order, then the whole school", () => {
  const groups = groupCategories(categories, divisions);

  assert.deepEqual(
    groups.map((g) => [g.name, g.categories.map((c) => c.id)]),
    [
      ["Lower School", ["l-aca", "l-other"]],
      ["Upper School", ["u-aca", "u-ath", "u-other"]],
      [WHOLE_SCHOOL, ["w-aca", "w-other"]],
    ]
  );
});

test("keeps Other last in its group, whatever its sort order", () => {
  const groups = groupCategories(
    [
      { id: "o", name: "Other", division_id: null, sort_order: 0 },
      { id: "z", name: "Zoology", division_id: null, sort_order: 10 },
    ],
    []
  );

  assert.deepEqual(groups[0].categories.map((c) => c.id), ["z", "o"]);
});

test("files a category whose division is gone under the whole school", () => {
  const groups = groupCategories(
    [{ id: "x", name: "Lost", division_id: "deleted" }],
    divisions
  );

  assert.deepEqual(groups.map((g) => g.name), [WHOLE_SCHOOL]);
});

test("labels categories with their group once a school uses divisions", () => {
  const labels = categoryLabels(categories, divisions);

  assert.equal(labels.get("u-aca"), "Upper School · Academics");
  assert.equal(labels.get("w-aca"), "Whole School · Academics");
  assert.equal(categoryLabels(categories, divisions, " / ").get("l-aca"), "Lower School / Academics");
});

test("keeps plain names for a school that doesn't group by division", () => {
  const flat = [{ id: "forms", name: "Forms" }];

  assert.equal(categoryLabels(flat, divisions).get("forms"), "Forms");
  assert.equal(hasDivisionCategories(flat), false);
  assert.equal(hasDivisionCategories(categories), true);
});

test("keeps mail from a division's address within that division", () => {
  assert.deepEqual(
    candidateCategories(categories, ["upper"]).map((c) => c.id),
    ["u-other", "u-ath", "u-aca"]
  );
  assert.equal(candidateCategories(categories, []).length, categories.length);
  // A division with no categories of its own doesn't strand the document.
  assert.equal(candidateCategories(categories, ["middle"]).length, categories.length);
});

test("falls back to Other in the document's division, else the whole school's", () => {
  assert.equal(fallbackCategory(categories, ["upper"])?.id, "u-other");
  assert.equal(fallbackCategory(categories, ["middle", "lower"])?.id, "l-other");
  assert.equal(fallbackCategory(categories, [])?.id, "w-other");
  assert.equal(fallbackCategory([{ id: "a", name: "Academics" }], []), null);
});
