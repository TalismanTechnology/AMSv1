import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadParentContacts, parentVisibleContacts } from "./parent-directory";

type Result = { data: unknown; error: unknown };

/**
 * A fake client: records every call per table, and answers each query on a
 * table from that table's queue of results.
 */
function fakeClient(results: Record<string, Result[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const client = {
    from(table: string) {
      calls.push({ table, method: "from", args: [] });
      const query: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "neq"]) {
        query[m] = (...args: unknown[]) => {
          calls.push({ table, method: m, args });
          return query;
        };
      }
      query.then = (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        const next = results[table]?.shift() ?? { data: [], error: null };
        return Promise.resolve(next).then(resolve, reject);
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const approved = {
  id: "c1",
  name: "Jane Smith",
  role: "School Nurse",
  email: "nurse@school.org",
  phone: null,
  division_id: null,
  topics: ["health"],
  status: "approved",
  folder_id: "f1",
};

test("parentVisibleContacts keeps only approved, reachable rows and parent columns", () => {
  const rows = [
    approved,
    { ...approved, id: "c2", status: "suggested" },
    { ...approved, id: "c3", status: "rejected" },
    { ...approved, id: "c4", status: undefined },
    { ...approved, id: "c5", email: " ", phone: null },
    { ...approved, id: "c6", email: null, phone: "555-123-4567", source_excerpt: "secret" },
  ];
  const out = parentVisibleContacts(rows as never);
  assert.deepEqual(out.map((c) => c.id), ["c1", "c6"]);
  assert.deepEqual(Object.keys(out[1]).sort(), [
    "division_id", "email", "folder_id", "id", "name", "phone", "role", "topics",
  ]);
});

test("asks for this school's approved contacts only", async () => {
  const { client, calls } = fakeClient({
    school_contacts: [{ data: [approved], error: null }],
    contact_folders: [{ data: [{ id: "f1", name: "Health", sort_order: 0 }], error: null }],
  });
  const result = await loadParentContacts(client, "school-1");
  const contactCalls = calls.filter((c) => c.table === "school_contacts");
  assert.ok(contactCalls.some((c) => c.method === "eq" && c.args[0] === "school_id" && c.args[1] === "school-1"));
  assert.ok(contactCalls.some((c) => c.method === "eq" && c.args[0] === "status" && c.args[1] === "approved"));
  const select = contactCalls.find((c) => c.method === "select")?.args[0] as string;
  assert.ok(!/source_excerpt|source_document|\*/.test(select), select);
  assert.ok(calls.some((c) => c.table === "contact_folders" && c.method === "eq" && c.args[1] === "school-1"));
  assert.deepEqual(result.contacts.map((c) => c.id), ["c1"]);
  assert.deepEqual(result.folders.map((f) => f.name), ["Health"]);
});

test("a non-approved row that slips through is still dropped", async () => {
  const { client } = fakeClient({
    school_contacts: [{ data: [approved, { ...approved, id: "c2", status: "suggested" }], error: null }],
  });
  const result = await loadParentContacts(client, "school-1");
  assert.deepEqual(result.contacts.map((c) => c.id), ["c1"]);
});

test("without migration 049: retries without folder_id and returns no folders", async () => {
  const { client, calls } = fakeClient({
    school_contacts: [
      { data: null, error: { code: "42703", message: "column school_contacts.folder_id does not exist" } },
      { data: [{ ...approved, folder_id: undefined }], error: null },
    ],
    contact_folders: [{ data: null, error: { code: "PGRST205", message: "Could not find the table" } }],
  });
  const result = await loadParentContacts(client, "school-1");
  const selects = calls.filter((c) => c.table === "school_contacts" && c.method === "select");
  assert.equal(selects.length, 2);
  assert.ok(!(selects[1].args[0] as string).includes("folder_id"));
  // The retry is filtered to approved too.
  assert.equal(
    calls.filter((c) => c.table === "school_contacts" && c.method === "eq" && c.args[0] === "status" && c.args[1] === "approved").length,
    2
  );
  assert.deepEqual(result.contacts.map((c) => [c.id, c.folder_id]), [["c1", null]]);
  assert.deepEqual(result.folders, []);
});

test("without migration 044: no contacts, no error", async () => {
  const { client } = fakeClient({
    school_contacts: [{ data: null, error: { code: "42P01", message: "relation does not exist" } }],
  });
  assert.deepEqual(await loadParentContacts(client, "school-1"), { contacts: [], folders: [] });
});
