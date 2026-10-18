import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contactCardPrompt, loadApprovedContacts, routeUnansweredQuestion } from "./route-contact";

/** A client whose every query resolves to `result`. */
function fakeClient(result: { data: unknown; error: unknown }): SupabaseClient {
  const query: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) query[m] = () => query;
  query.then = (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { from: () => query } as unknown as SupabaseClient;
}

test("a missing school_contacts table means no contacts", async () => {
  for (const code of ["PGRST205", "42P01"]) {
    const client = fakeClient({ data: null, error: { code, message: "missing" } });
    assert.deepEqual(await loadApprovedContacts(client, "s"), []);
  }
});

test("a throwing client means no contacts", async () => {
  const client = { from: () => { throw new Error("boom"); } } as unknown as SupabaseClient;
  assert.deepEqual(await loadApprovedContacts(client, "s"), []);
});

test("no approved contacts means no card and no model call", async () => {
  const routed = await routeUnansweredQuestion({
    supabase: fakeClient({ data: [], error: null }),
    schoolId: "s",
    contacts: [],
    providerQuestion: "when is the bus?",
    divisionHints: [],
  });
  assert.equal(routed, null);
});

test("a main-office-only directory routes without classifying", async () => {
  const routed = await routeUnansweredQuestion({
    supabase: fakeClient({ data: [{ id: "d1", name: "Lower School" }], error: null }),
    schoolId: "s",
    contacts: [
      {
        id: "o",
        name: "Pat Lee",
        role: "Receptionist",
        email: " office@school.org ",
        phone: null,
        division_id: null,
        topics: ["main_office"],
        status: "approved",
      },
    ],
    providerQuestion: "anything",
    divisionHints: ["lower school question"],
  });
  assert.deepEqual(routed, {
    topic: null,
    card: {
      id: "o",
      name: "Pat Lee",
      role: "Receptionist",
      email: "office@school.org",
      phone: null,
      division: null,
    },
  });
});

test("the card prompt never carries contact details", () => {
  const prompt = contactCardPrompt({
    id: "n",
    name: "Jane Smith",
    role: "School Nurse",
    email: "nurse@school.org",
    phone: "(212) 555-0100",
    division: "Lower School",
  });
  assert.ok(prompt.includes("School Nurse"));
  assert.ok(!prompt.includes("nurse@school.org"));
  assert.ok(!prompt.includes("555-0100"));
});
