import { test } from "node:test";
import assert from "node:assert/strict";
import { groupSources } from "./source-groups";
import type { ChatSource } from "./types";

function source(n: number, document_id: string, extra: Partial<ChatSource> = {}): ChatSource {
  return {
    document_id,
    title: document_id,
    chunk_content: `passage ${n}`,
    similarity: 0.7,
    source_number: n,
    source_type: "document",
    ...extra,
  };
}

test("lists only cited documents, in the order the answer first cites them", () => {
  const sources = [source(1, "A"), source(2, "B"), source(3, "C")];

  const groups = groupSources(sources, new Set([3, 1]));

  assert.deepEqual(groups.map((g) => g.key), ["C", "A"]);
  assert.ok(groups.every((g) => g.isCited));
});

test("merges passages of one document into a row, keeping [N] numbers", () => {
  const sources = [source(1, "Handbook"), source(2, "Letter"), source(3, "Handbook")];

  const groups = groupSources(sources, new Set([3, 2, 1]));

  assert.deepEqual(groups.map((g) => g.key), ["Handbook", "Letter"]);
  assert.deepEqual(groups[0].passages.map((p) => p.source_number), [1, 3]);
});

test("merges documents with the same normalized title into the first-cited", () => {
  const sources = [
    source(1, "e1", { title: "Calendar Details - Collegiate School" }),
    source(2, "e2", { title: "calendar details – Collegiate School" }),
  ];

  const groups = groupSources(sources, new Set([2, 1]));

  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "e2");
  assert.deepEqual(groups[0].passages.map((p) => p.source_number), [1, 2]);
});

test("merges documents with the same source URL", () => {
  const url = "https://school.org/admissions";
  const sources = [
    source(1, "a", { title: "Admissions", source_url: url }),
    source(2, "b", { title: "Apply Now", source_url: url }),
  ];

  const groups = groupSources(sources, new Set([1, 2]));

  assert.equal(groups.length, 1);
  assert.equal(groups[0].isWebsite, true);
});

test("caps the list at three rows", () => {
  const sources = ["A", "B", "C", "D", "E"].map((id, i) => source(i + 1, id));

  const groups = groupSources(sources, new Set([5, 4, 3, 2, 1]));

  assert.deepEqual(groups.map((g) => g.key), ["E", "D", "C"]);
});

test("a passage of a listed document still joins its row past the cap", () => {
  const sources = ["A", "B", "C", "D"].map((id, i) => source(i + 1, id)).concat(source(5, "A"));

  const groups = groupSources(sources, new Set([1, 2, 3, 4, 5]));

  assert.deepEqual(groups.map((g) => g.key), ["A", "B", "C"]);
  assert.deepEqual(groups[0].passages.map((p) => p.source_number), [1, 5]);
});

test("falls back to the single strongest document when nothing is cited", () => {
  const sources = [
    source(1, "A", { similarity: 0.6 }),
    source(2, "B", { similarity: 0.9 }),
    source(3, "A", { similarity: 0.8 }),
  ];

  const groups = groupSources(sources, new Set());

  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "B");
  assert.equal(groups[0].isCited, false);
});

test("ignores cited numbers with no matching source", () => {
  assert.deepEqual(groupSources([source(1, "A")], new Set([9])).map((g) => g.key), ["A"]);
  assert.deepEqual(groupSources([], new Set([1])), []);
});

test("marks website pages", () => {
  const groups = groupSources(
    [source(1, "page", { source_url: "https://school.org/x" }), source(2, "doc")],
    new Set([1, 2])
  );

  assert.deepEqual(groups.map((g) => g.isWebsite), [true, false]);
});
