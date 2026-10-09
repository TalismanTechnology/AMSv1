import { test } from "node:test";
import assert from "node:assert/strict";
import { shareableAnswer } from "./share-answer";
import type { ChatSource } from "./types";

const source = (n: number, title: string, label?: string): ChatSource => ({
  document_id: `doc-${n}`,
  title,
  chunk_content: "",
  similarity: 1,
  source_number: n,
  location: label ? { label } : null,
});

test("strips markdown and citation markers, lists only cited sources", () => {
  const text = shareableAnswer(
    "## Pickup\n\n**Early dismissal** is at *1:30 pm* [1].\n\n- Bring your ID [2]",
    [source(1, "Parent Handbook", "p. 14"), source(2, "Gate policy"), source(3, "Unused")],
    "Collegiate School"
  );

  assert.equal(
    text,
    "Pickup\n\nEarly dismissal is at 1:30 pm.\n\n• Bring your ID\n\n" +
      "Sources:\n• Parent Handbook (p. 14)\n• Gate policy\n\n" +
      "From Collegiate School on AskMySchool"
  );
});

test("no sources, no school", () => {
  assert.equal(shareableAnswer("Yes.", undefined), "Yes.\n\nFrom AskMySchool");
});

test("keeps link labels, drops URLs, de-duplicates titles", () => {
  const text = shareableAnswer("See [the form](https://x.test/form) [1][2]", [
    source(1, "Forms"),
    source(2, "Forms"),
  ]);
  assert.equal(text, "See the form\n\nSources:\n• Forms\n\nFrom AskMySchool");
});
