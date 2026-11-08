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
    getRosterSummary: async (id) => {
      calls.push(`roster:${id}`);
      return { installed: false };
    },
    ...overrides,
  };
  return { deps, calls };
}

function rosterSummary(activeCount: number) {
  return async () => ({ installed: true as const, activeCount, lastUpdatedAt: null });
}

// ── roster ───────────────────────────────────────────────

test("roster school with active parents is enabled, without a Blackbaud connection", async () => {
  const { deps, calls } = fakes({ getRosterSummary: rosterSummary(3) });
  const result = await getSchoolSignIn({ id: "acme", auth_provider: "roster" }, deps);
  assert.deepEqual(result, { provider: "roster", enabled: true });
  assert.deepEqual(calls, []);
});

test("roster school with an empty roster is disabled", async () => {
  const { deps } = fakes({
    getRosterSummary: rosterSummary(0),
    // A stray Blackbaud connection must not enable a roster school.
    getSchoolEnvironmentId: async () => "env-123",
  });
  const result = await getSchoolSignIn({ id: "acme", auth_provider: "roster" }, deps);
  assert.deepEqual(result, { provider: "roster", enabled: false });
});

test("roster school before migration 045 is disabled", async () => {
  const { deps, calls } = fakes({ getSchoolEnvironmentId: async () => "env-123" });
  const result = await getSchoolSignIn({ id: "acme", auth_provider: "roster" }, deps);
  assert.deepEqual(result, { provider: "roster", enabled: false });
  assert.deepEqual(calls, ["roster:acme"]);
});

test("roster read failure fails closed instead of throwing", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const { deps } = fakes({
      getRosterSummary: async () => {
        throw new Error("boom");
      },
    });
    const result = await getSchoolSignIn({ id: "acme", auth_provider: "roster" }, deps);
    assert.deepEqual(result, { provider: "roster", enabled: false });
  } finally {
    console.error = quiet;
  }
});

// ── other providers unchanged ───────────────────────────

test("Blackbaud school is enabled by its environment id, ignoring the roster", async () => {
  const { deps, calls } = fakes({
    getSchoolEnvironmentId: async (id) => (id === "collegiate" ? "env-123" : null),
    getRosterSummary: rosterSummary(5),
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

test("Veracross school is enabled by its connection, ignoring Blackbaud and the roster", async () => {
  const { deps } = fakes({
    getVeracrossConnection: async (id) => (id === "poly" ? { schoolId: id } : null),
    getSchoolEnvironmentId: async () => "env-123",
    getRosterSummary: rosterSummary(5),
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
