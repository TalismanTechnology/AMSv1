import { test } from "node:test";
import assert from "node:assert/strict";
import { isEventVisible, usedLabels, UNLABELED_FILTER_ID } from "./event-filters";

const labels = [
  { id: "athletics", name: "Athletics" },
  { id: "arts", name: "Arts" },
  { id: "lower", name: "Lower School" },
];
const ev = (label_id: string | null) => ({ label_id });

test("shows everything when nothing is hidden", () => {
  assert.ok(isEventVisible(ev("athletics"), new Set()));
  assert.ok(isEventVisible(ev(null), new Set()));
});

test("hiding a label hides only that label's events", () => {
  const hidden = new Set(["athletics"]);
  assert.ok(!isEventVisible(ev("athletics"), hidden));
  assert.ok(isEventVisible(ev("arts"), hidden));
  assert.ok(isEventVisible(ev(null), hidden));
});

test("unlabeled events hide with their own toggle", () => {
  const hidden = new Set([UNLABELED_FILTER_ID]);
  assert.ok(!isEventVisible(ev(null), hidden));
  assert.ok(isEventVisible(ev("arts"), hidden));
});

test("lists only labels events actually use, in label order", () => {
  const used = usedLabels([ev("lower"), ev("athletics"), ev("lower")], labels);
  assert.deepEqual(used.labels.map((l) => l.id), ["athletics", "lower"]);
  assert.equal(used.hasUnlabeled, false);
});

test("reports unlabeled events so they get a toggle", () => {
  const used = usedLabels([ev(null), ev("arts")], labels);
  assert.deepEqual(used.labels.map((l) => l.id), ["arts"]);
  assert.equal(used.hasUnlabeled, true);
});
