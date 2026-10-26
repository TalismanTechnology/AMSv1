import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { approveSuggestedContacts, MAX_BULK_APPROVE } from "./approve";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

/** Records every call on the query; resolves to `result`. */
function recordingClient(result: { data: unknown; error: unknown }) {
  const calls: [string, ...unknown[]][] = [];
  const query: Record<string, unknown> = {};
  for (const m of ["update", "eq", "in", "select"]) {
    query[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return query;
    };
  }
  query.then = (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve);
  const client = {
    from: (table: string) => {
      calls.push(["from", table]);
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test("approves only this school's still-suggested contacts, by id", async () => {
  const { client, calls } = recordingClient({ data: [{ id: A }, { id: B }], error: null });
  const result = await approveSuggestedContacts(client, "school-1", [A, B, A]);
  assert.deepEqual(result, { approved: 2 });
  assert.deepEqual(calls[0], ["from", "school_contacts"]);
  const update = calls.find((c) => c[0] === "update")?.[1] as { status: string };
  assert.equal(update.status, "approved");
  assert.ok(calls.some((c) => c[0] === "eq" && c[1] === "school_id" && c[2] === "school-1"));
  assert.ok(calls.some((c) => c[0] === "eq" && c[1] === "status" && c[2] === "suggested"));
  assert.deepEqual(calls.find((c) => c[0] === "in"), ["in", "id", [A, B]]);
});

test("no valid ids → no query", async () => {
  const { client, calls } = recordingClient({ data: [], error: null });
  assert.deepEqual(await approveSuggestedContacts(client, "school-1", ["not-a-uuid", ""]), {
    approved: 0,
  });
  assert.equal(calls.length, 0);
});

test("too many ids is refused without a query", async () => {
  const { client, calls } = recordingClient({ data: [], error: null });
  const ids = Array.from({ length: MAX_BULK_APPROVE + 1 }, (_, i) =>
    `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
  );
  const result = await approveSuggestedContacts(client, "school-1", ids);
  assert.equal(result.approved, 0);
  assert.ok(result.error);
  assert.equal(calls.length, 0);
});

test("a database error is passed back", async () => {
  const { client } = recordingClient({ data: null, error: { code: "42P01", message: "missing" } });
  const result = await approveSuggestedContacts(client, "school-1", [A]);
  assert.equal(result.approved, 0);
  assert.equal(result.error?.code, "42P01");
});
