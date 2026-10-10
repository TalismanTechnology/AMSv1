import test from "node:test";
import assert from "node:assert/strict";

import { labelChildren, redactChildNames, redactChildNamesInMessages } from "./child-privacy";
import { formatChildrenContext } from "./context";

const KIDS = [
  { name: "Mia Lopez", grade: "3" },
  { name: "Lucas", grade: "8" },
];

test("children are labelled by spelled-out grade", () => {
  assert.deepEqual(labelChildren(KIDS), [
    { label: "your 3rd Grade child", grade: "3rd Grade" },
    { label: "your 8th Grade child", grade: "8th Grade" },
  ]);
});

test("children in the same grade are numbered apart", () => {
  const twins = labelChildren([
    { name: "Ana", grade: "K" },
    { name: "Ben", grade: "K" },
  ]);
  assert.deepEqual(
    twins.map((t) => t.label),
    ["your Kindergarten child #1", "your Kindergarten child #2"]
  );
});

test("the system prompt's children block has grades and no names", () => {
  const block = formatChildrenContext(KIDS);
  assert.doesNotMatch(block, /Mia|Lopez|Lucas/);
  assert.match(block, /your 3rd Grade child/);
  assert.match(block, /8th Grade/);
  assert.match(block, /NOT ages/);
});

test("names the parent types are replaced with the child's label", () => {
  assert.equal(
    redactChildNames("What time does Mia's class leave? And lucas?", KIDS),
    "What time does [your 3rd Grade child]'s class leave? And [your 8th Grade child]?"
  );
  assert.equal(
    redactChildNames("Is Mia Lopez on the bus list?", KIDS),
    "Is [your 3rd Grade child] on the bus list?"
  );
});

test("names inside other words are left alone", () => {
  assert.equal(
    redactChildNames("Is there a Miami trip? Lucasville?", KIDS),
    "Is there a Miami trip? Lucasville?"
  );
});

test("a first name that is an everyday word is only replaced mid-sentence", () => {
  const kids = [{ name: "Will", grade: "5" }];
  assert.equal(
    redactChildNames("Will school close early? Can Will bring a snack?", kids),
    "Will school close early? Can [your 5th Grade child] bring a snack?"
  );
  assert.equal(redactChildNames("they will be late", kids), "they will be late");
});

test("a month name is never replaced on its own, but a full name is", () => {
  const kids = [{ name: "May Chen", grade: "2" }];
  assert.equal(
    redactChildNames("Is school closed in May? May Chen has a recital.", kids),
    "Is school closed in May? [your 2nd Grade child] has a recital."
  );
});

test("no children means the text is untouched", () => {
  assert.equal(redactChildNames("Mia?", []), "Mia?");
});

test("every text part of every message is redacted; other parts pass through", () => {
  const messages = [
    { role: "user", parts: [{ type: "text", text: "Lunch for Mia?" }] },
    {
      role: "assistant",
      parts: [
        { type: "text", text: "Mia's lunch is at noon." },
        { type: "data-sources", data: [] } as { type: string; text?: string },
      ],
    },
  ];
  const out = redactChildNamesInMessages(messages, KIDS);
  assert.equal(out[0].parts[0].text, "Lunch for [your 3rd Grade child]?");
  assert.equal(out[1].parts[0].text, "[your 3rd Grade child]'s lunch is at noon.");
  assert.equal(out[1].parts[1].type, "data-sources");
  // The originals (saved to our own history) are not mutated.
  assert.equal(messages[0].parts[0].text, "Lunch for Mia?");
});
