import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyStatus,
  conditionalHeaders,
  htmlContentHash,
  needsReingest,
  nextMissingState,
  sha256,
  shouldApplyMissing,
  type KnownPage,
} from "./change";

const indexed: KnownPage = {
  content_hash: htmlContentHash("Admissions", "Apply by January 15."),
  etag: '"abc123"',
  last_modified: "Tue, 01 Sep 2026 10:00:00 GMT",
  document_id: "doc-1",
};

test("hash ignores whitespace-only changes but not content changes", () => {
  const a = htmlContentHash("Admissions", "Apply by\n  January 15.");
  const b = htmlContentHash(" Admissions ", "Apply by January 15.");
  const c = htmlContentHash("Admissions", "Apply by January 16.");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(sha256("x"), sha256(Buffer.from("x")));
});

test("title changes count as changes", () => {
  assert.notEqual(htmlContentHash("Admissions", "Same"), htmlContentHash("Admission", "Same"));
});

test("unchanged content with a live document is not re-ingested", () => {
  assert.equal(needsReingest(indexed, htmlContentHash("Admissions", "Apply by January 15.")), false);
});

test("changed content, a new page, or a lost document is re-ingested", () => {
  assert.equal(needsReingest(indexed, htmlContentHash("Admissions", "Apply by February 1.")), true);
  assert.equal(needsReingest(null, "anything"), true);
  assert.equal(needsReingest({ ...indexed, document_id: null }, indexed.content_hash!), true);
  // A failed processing run leaves the hash unset so the next sync retries.
  assert.equal(needsReingest({ ...indexed, content_hash: null }, "h"), true);
});

test("conditional GET validators only for fully indexed pages", () => {
  assert.deepEqual(conditionalHeaders(indexed), {
    "If-None-Match": '"abc123"',
    "If-Modified-Since": "Tue, 01 Sep 2026 10:00:00 GMT",
  });
  assert.deepEqual(conditionalHeaders(null), {});
  assert.deepEqual(conditionalHeaders({ ...indexed, document_id: null }), {});
  assert.deepEqual(conditionalHeaders({ ...indexed, content_hash: null }), {});
  assert.deepEqual(conditionalHeaders({ ...indexed, etag: null }), {
    "If-Modified-Since": "Tue, 01 Sep 2026 10:00:00 GMT",
  });
});

test("status classes: 404/410 delete now, 304 unchanged, 5xx error", () => {
  assert.equal(classifyStatus(200), "ok");
  assert.equal(classifyStatus(304), "not_modified");
  assert.equal(classifyStatus(404), "gone");
  assert.equal(classifyStatus(410), "gone");
  assert.equal(classifyStatus(403), "error");
  assert.equal(classifyStatus(503), "error");
});

test("pages are deleted after two completed syncs without being seen", () => {
  assert.deepEqual(nextMissingState(0), { missingCount: 1, remove: false });
  assert.deepEqual(nextMissingState(1), { missingCount: 2, remove: true });
});

test("a run that reached too little of the site doesn't age pages out", () => {
  assert.equal(shouldApplyMissing(0, 0, 300), false); // nothing fetched at all
  assert.equal(shouldApplyMissing(5, 0, 300), true); // first sync
  assert.equal(shouldApplyMissing(150, 300, 300), true);
  assert.equal(shouldApplyMissing(20, 300, 300), false); // site mostly down
  assert.equal(shouldApplyMissing(30, 300, 50), true); // admin lowered max_pages
});
