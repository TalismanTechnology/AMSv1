import { test } from "node:test";
import assert from "node:assert/strict";
import { selectPassages } from "./source-selection";
import type { CitablePassage } from "./rag";

function passage(
  document_id: string,
  similarity: number,
  extra: Partial<CitablePassage> = {}
): CitablePassage {
  return {
    document_id,
    title: document_id,
    content: `${document_id} text`,
    similarity,
    chunk_index: 0,
    chunk_indexes: [0],
    metadata: {},
    ...extra,
  };
}

const ids = (passages: CitablePassage[]) => passages.map((p) => p.document_id);

test("drops passages far below the best one", () => {
  const selected = selectPassages([
    passage("handbook", 0.8),
    passage("letter", 0.65),
    passage("menu", 0.55),
  ]);

  // Floor is max(0.5, 0.8 × 0.75 = 0.6).
  assert.deepEqual(ids(selected), ["handbook", "letter"]);
});

test("applies the absolute floor when the top score is low", () => {
  const selected = selectPassages([passage("handbook", 0.6), passage("letter", 0.48)]);

  assert.deepEqual(ids(selected), ["handbook"]);
});

test("always keeps the top passage, even below the absolute floor", () => {
  const selected = selectPassages([passage("letter", 0.3), passage("handbook", 0.4)]);

  assert.deepEqual(ids(selected), ["handbook"]);
});

test("keeps the top passage when its document duplicates an earlier one", () => {
  const selected = selectPassages([
    passage("old", 0.6, { title: "Handbook", source: "upload" }),
    passage("new", 0.9, { title: "Handbook", source: "upload" }),
  ]);

  assert.deepEqual(ids(selected), ["new"]);
});

test("keeps one document per source URL, the most relevant", () => {
  const selected = selectPassages([
    passage("a", 0.7, { source_url: "https://school.org/admissions/", title: "Admissions" }),
    passage("b", 0.8, { source_url: "https://school.org/admissions", title: "Apply" }),
    passage("c", 0.75, { source_url: "https://school.org/tuition", title: "Tuition" }),
  ]);

  assert.deepEqual(ids(selected), ["b", "c"]);
});

test("keeps at most two same-title website pages", () => {
  const page = (id: string, similarity: number) =>
    passage(id, similarity, {
      title: "Calendar Details - Collegiate School",
      source: "website",
      source_url: `https://school.org/calendar?event=${id}`,
    });

  const selected = selectPassages([page("e1", 0.7), page("e2", 0.8), page("e3", 0.75), page("e4", 0.72)]);

  assert.deepEqual(ids(selected), ["e2", "e3"]);
});

test("collapses same-title documents from the same source to one", () => {
  const selected = selectPassages([
    passage("v1", 0.8, { title: "Parent Handbook", source: "upload" }),
    passage("v2", 0.78, { title: "parent  handbook", source: "upload" }),
    passage("email", 0.77, { title: "Parent Handbook", source: "email" }),
  ]);

  assert.deepEqual(ids(selected), ["v1", "email"]);
});

test("keeps every passage of a kept document, in order", () => {
  const selected = selectPassages([
    passage("handbook", 0.8, { chunk_index: 3 }),
    passage("handbook", 0.7, { chunk_index: 40 }),
    passage("dup", 0.79, { title: "handbook" }),
  ]);

  assert.deepEqual(selected.map((p) => `${p.document_id}:${p.chunk_index}`), ["handbook:3", "handbook:40"]);
});

test("returns nothing for nothing", () => {
  assert.deepEqual(selectPassages([]), []);
});
