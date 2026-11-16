import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankHiddenSources,
  citedDocumentIds,
  hiddenDocumentIds,
  HIDDEN_SOURCE_TITLE,
} from "./source-visibility";
import type { ChatSource } from "@/lib/types";

const G10 = "10000000-0000-4000-8000-000000000010";
const OPEN = "00000000-0000-4000-8000-000000000001";

const source = (id: string, n: number): ChatSource => ({
  document_id: id,
  title: `Doc ${n}`,
  chunk_content: `secret text ${n}`,
  similarity: 0.8,
  file_url: `school/${n}.pdf`,
  source_number: n,
});

const messages = [
  { id: "m1", role: "user", sources: null },
  { id: "m2", role: "assistant", sources: [source(OPEN, 1), source(G10, 2)] },
];

test("citedDocumentIds skips calendar entries and admin notes", () => {
  const ids = citedDocumentIds([
    ...messages,
    { sources: [{ ...source("event-1", 3), source_type: "event" }, source("clarification:x", 4)] },
  ]);
  assert.deepEqual(ids, [OPEN, G10]);
});

test("a grade-9 parent replaying a chat doesn't get a grade-10-only passage", () => {
  // Restricted: G10. Readable through the grade-9 parent's own session: none.
  const hidden = hiddenDocumentIds([G10], []);
  const replayed = blankHiddenSources(messages, hidden);
  const [open, restricted] = replayed[1].sources!;
  assert.equal(open.chunk_content, "secret text 1");
  assert.equal(restricted.title, HIDDEN_SOURCE_TITLE);
  assert.equal(restricted.chunk_content, "");
  assert.equal(restricted.file_url, undefined);
  // [2] still points at the second source.
  assert.equal(restricted.source_number, 2);
  assert.doesNotMatch(JSON.stringify(replayed), /secret text 2/);
});

test("a grade-10 parent still sees it", () => {
  const replayed = blankHiddenSources(messages, hiddenDocumentIds([G10], [G10]));
  assert.equal(replayed, messages);
});
