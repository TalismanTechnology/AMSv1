import test from "node:test";
import assert from "node:assert/strict";
import { getSchoolSignIn, type SchoolSignInDeps } from "./sign-in-schools";

// No real Supabase calls: every lookup is injected, and each fake records
// which provider check getSchoolSignIn actually consulted.

function fakes(overrides: SchoolSignInDeps = {}) {
  const calls: string[] = [];
  const deps: SchoolSignInDeps = {
    getVeracrossConnection: async (id) => {
      calls.push(`veracross:${id}`);
      return null;
    },
    getSchoolEnvironmentId: async (id) => {
      calls.push(`blackbaud:${id}`);
      return null;
    },
    ...overrides,
  };
  return { deps, calls };
}

// ── leftover roster (emailed-code sign-in, removed) ──────

test("a leftover roster school never has parent sign-in, even with a Blackbaud connection", async () => {
  const { deps, calls } = fakes({
    getSchoolEnvironmentId: async () => "env-123",
    getVeracrossConnection: async (id) => ({ schoolId: id }),
  });
  const result = await getSchoolSignIn({ id: "acme", auth_provider: "roster" }, deps);
  assert.deepEqual(result, { provider: "roster", enabled: false });
  assert.deepEqual(calls, []);
});

// ── Blackbaud and Veracross ─────────────────────────────

test("Blackbaud school is enabled by its environment id", async () => {
  const { deps, calls } = fakes({
    getSchoolEnvironmentId: async (id) => (id === "collegiate" ? "env-123" : null),
  });
  assert.deepEqual(await getSchoolSignIn({ id: "collegiate", auth_provider: "blackbaud" }, deps), {
    provider: "blackbaud",
    enabled: true,
  });
  assert.deepEqual(await getSchoolSignIn({ id: "trinity", auth_provider: null }, deps), {
    provider: "blackbaud",
    enabled: false,
  });
  assert.deepEqual(await getSchoolSignIn({ id: "legacy" }, deps), {
    provider: "blackbaud",
    enabled: false,
  });
  assert.deepEqual(calls, []);
});

test("Veracross school is enabled by its connection, ignoring Blackbaud", async () => {
  const { deps } = fakes({
    getVeracrossConnection: async (id) => (id === "poly" ? { schoolId: id } : null),
    getSchoolEnvironmentId: async () => "env-123",
  });
  assert.deepEqual(await getSchoolSignIn({ id: "poly", auth_provider: "veracross" }, deps), {
    provider: "veracross",
    enabled: true,
  });
  assert.deepEqual(await getSchoolSignIn({ id: "dalton", auth_provider: "veracross" }, deps), {
    provider: "veracross",
    enabled: false,
  });
});
