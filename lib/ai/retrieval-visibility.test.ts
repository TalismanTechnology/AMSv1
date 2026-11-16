import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  keywordSearchChunks,
  matchDocumentChunks,
  RETRIEVAL_RPCS,
  setRetrievalRpcForTests,
} from "./rag";

// Grade-restricted documents (migration 051) never reach a parent who can't
// see them. The database decides (the *_v2 functions work out the viewer's
// grades from their id, and RLS guards every user-session read); these tests
// pin the app to those paths so nothing can route around them.

afterEach(() => setRetrievalRpcForTests(null));

type Call = { fn: string; args: Record<string, unknown> };

function stubRpc(reply: (call: Call) => { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  setRetrievalRpcForTests(() => ({
    rpc: (fn, args) => {
      const call = { fn, args };
      calls.push(call);
      return Promise.resolve(reply(call));
    },
  }));
  return calls;
}

const embed = async () => [0.1, 0.2];
const scope = { schoolId: "school-1", viewerId: "parent-grade-9" };

test("vector search calls the viewer-scoped function with the viewer's id, not grades", async () => {
  const calls = stubRpc(() => ({ data: [], error: null }));
  await matchDocumentChunks("trip", scope, 40, 0.45, undefined, embed);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, "match_document_chunks_v2");
  assert.equal(calls[0].args.p_viewer, "parent-grade-9");
  assert.equal(calls[0].args.p_school_id, "school-1");
  assert.equal("p_viewer_grades" in calls[0].args, false);
});

test("keyword search calls the viewer-scoped function for every term", async () => {
  const calls = stubRpc(() => ({ data: [], error: null }));
  await keywordSearchChunks("grade ten field trip", scope);
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.equal(call.fn, "search_document_chunks_v2");
    assert.equal(call.args.p_viewer, "parent-grade-9");
  }
});

test("an RPC error returns nothing; there is no fallback to an unscoped search", async () => {
  const calls = stubRpc(() => ({ data: null, error: { code: "PGRST202", message: "not found" } }));
  assert.deepEqual(await matchDocumentChunks("trip", scope, 40, 0.45, undefined, embed), []);
  assert.deepEqual(await keywordSearchChunks("grade ten trip", scope), []);
  assert.ok(calls.every((c) => c.fn.endsWith("_v2")));
});

test("without a viewer nothing is searched", async () => {
  const calls = stubRpc(() => assert.fail("must not search"));
  assert.deepEqual(
    await matchDocumentChunks("trip", { schoolId: "s", viewerId: "" }, 40, 0.45, undefined, embed),
    []
  );
  assert.deepEqual(await keywordSearchChunks("trip", { schoolId: "s", viewerId: "" }), []);
  assert.equal(calls.length, 0);
});

test("the retrieval function names are the scoped ones", () => {
  assert.deepEqual(RETRIEVAL_RPCS, {
    vector: "match_document_chunks_v2",
    keyword: "search_document_chunks_v2",
  });
});

// ── Source-level guards on every path a parent could reach ────────────

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
function filesUnder(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    return statSync(path.join(root, rel)).isDirectory() ? filesUnder(rel) : [rel];
  });
}

test("no app code calls the old, unscoped retrieval functions", () => {
  const files = ["app", "lib", "actions", "components"]
    .flatMap(filesUnder)
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"));
  for (const file of files) {
    assert.doesNotMatch(
      read(file),
      /["'](match_document_chunks|search_document_chunks)["']/,
      `${file} must use the *_v2 functions`
    );
  }
});

test("the chat scopes retrieval to the signed-in user", () => {
  assert.match(read("app/api/chat/route.ts"), /viewerId: user\.id/);
  const turn = read("lib/ai/chat-turn.ts");
  assert.match(turn, /const scope = \{ schoolId, viewerId \}/);
  assert.match(turn, /matchDocumentChunks\(searchQuery, scope/);
  assert.match(turn, /keywordSearchChunks\(searchQuery, scope\)/);
  // Rulings quoting a document the viewer can't see are dropped.
  assert.match(turn, /keepConflictsInReach\(/);
});

test("content search runs with the user's session and is scoped to them", () => {
  const source = read("actions/documents.ts");
  const body = source.slice(source.indexOf("export async function searchDocumentContent("));
  assert.match(body, /await createClient\(\)/);
  assert.match(body, /search_document_chunks_v2/);
  assert.match(body, /p_viewer: user\.id/);
});

test("document routes read the document through the user's session (RLS) before anything else", () => {
  for (const route of ["content", "source", "status", "url"]) {
    const source = read(`app/api/documents/[id]/${route}/route.ts`);
    const userRead = source.search(/supabase\s*\n?\s*\.from\("documents"\)/);
    assert.ok(userRead > 0, `${route}: documents must be read with the user's client`);
    assert.doesNotMatch(source, /admin\s*\n?\s*\.from\("documents"\)/, `${route}: no service-role document read`);
    assert.doesNotMatch(source, /admin\s*\n?\s*\.from\("document_chunks"\)/, `${route}: no service-role chunk read`);
    const signing = source.indexOf("createSignedUrl");
    if (signing !== -1) assert.ok(signing > userRead, `${route}: sign only after the RLS read`);
  }
});

test("parent document lists and name search use the user's session (RLS)", () => {
  const parent = read("actions/parent-documents.ts");
  assert.match(parent, /createClient\(\)/);
  assert.doesNotMatch(parent, /createAdminClient/);
  const page = read("app/s/[slug]/(dashboard)/parent/documents/page.tsx");
  assert.doesNotMatch(page, /createAdminClient/);
  const docs = read("actions/documents.ts");
  const byName = docs.slice(docs.indexOf("export async function searchDocumentsByName("));
  assert.match(byName.slice(0, byName.indexOf("\nexport ")), /await createClient\(\)/);
});

test("new-document pushes are grouped by what each parent may see", () => {
  const runner = read("lib/push/document-push-runner.ts");
  assert.match(runner, /groupRecipientsByVisibleDocuments\(/);
  assert.match(runner, /visible_grades/);
});

test("saved chats blank citations the viewer can no longer read", () => {
  const chat = read("actions/chat.ts");
  assert.match(chat, /withoutHiddenSources\(admin, chat\.messages\)/);
});
