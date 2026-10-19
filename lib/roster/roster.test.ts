import test from "node:test";
import assert from "node:assert/strict";
import { planRosterChildrenSync, type ExistingChildRow } from "./children";
import { decideRosterGate, isRosterMatchRequired, rosterGateMessage } from "./gate";
import { planRosterReplacement } from "./store";
import {
  AUTH_PROVIDERS,
  parentSignInHref,
  providerForStartPath,
  resolveAuthProvider,
} from "../auth/provider";

// ── provider ─────────────────────────────────────────────

test("'roster' resolves to the roster provider; unknown values stay Blackbaud", () => {
  assert.equal(resolveAuthProvider("roster"), "roster");
  assert.equal(resolveAuthProvider("ROSTER"), "blackbaud");
  assert.equal(resolveAuthProvider("email"), "blackbaud");
  assert.equal(resolveAuthProvider(undefined), "blackbaud");
});

test("roster sign-in has no start path: the native app never intercepts it", () => {
  assert.equal(AUTH_PROVIDERS.roster.startPath, null);
  assert.equal(parentSignInHref("roster", "acme"), "/s/acme/login");
  assert.equal(parentSignInHref("roster", "poly prep"), "/s/poly%20prep/login");
  assert.equal(providerForStartPath("/s/acme/login"), null);
  assert.equal(providerForStartPath(""), null);
  // Blackbaud and Veracross are unchanged.
  assert.equal(providerForStartPath("/auth/blackbaud"), "blackbaud");
  assert.equal(providerForStartPath("/auth/veracross"), "veracross");
  assert.equal(parentSignInHref("blackbaud", "collegiate"), "/auth/blackbaud?school=collegiate");
});

// ── gate ─────────────────────────────────────────────────

test("the gate is off unless the school row says exactly true", () => {
  assert.equal(isRosterMatchRequired({ require_roster_match: true }), true);
  assert.equal(isRosterMatchRequired({ require_roster_match: false }), false);
  assert.equal(isRosterMatchRequired({ require_roster_match: null }), false);
  assert.equal(isRosterMatchRequired({ require_roster_match: "true" }), false);
  assert.equal(isRosterMatchRequired({}), false); // pre-045 row
  assert.equal(isRosterMatchRequired(null), false);
});

test("gate decisions", () => {
  for (const lookup of ["match", "no_match", "not_installed", "error"] as const) {
    assert.equal(decideRosterGate(false, lookup), "pass", `not required, ${lookup}`);
  }
  assert.equal(decideRosterGate(true, "match"), "pass");
  assert.equal(decideRosterGate(true, "not_installed"), "pass");
  assert.equal(decideRosterGate(true, "no_match"), "blocked");
  assert.equal(decideRosterGate(true, "error"), "error");
  assert.equal(
    rosterGateMessage("Acme School"),
    "Your email isn't on Acme School's parent list for AskMySchool yet. Please contact the school office."
  );
});

// ── children ─────────────────────────────────────────────

const ava = { name: "Ava Smith", grade: "3" };
const leo = { name: "Leo Smith", grade: "K" };

test("first roster sign-in with no children adds every child that has a grade", () => {
  const plan = planRosterChildrenSync([], [ava, leo, { name: "Sam", grade: null }]);
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.inserts, [
    { name: "Ava Smith", grade: "3", externalId: "ava smith" },
    { name: "Leo Smith", grade: "K", externalId: "leo smith" },
  ]);
});

test("hand-entered children block inserts on the first roster sign-in", () => {
  const existing: ExistingChildRow[] = [{ id: "c1", external_source: null, external_id: null }];
  assert.deepEqual(planRosterChildrenSync(existing, [ava]), { updates: [], inserts: [] });
});

test("linked children are refreshed; new roster children aren't added later", () => {
  const existing: ExistingChildRow[] = [
    { id: "c1", external_source: "roster", external_id: "ava smith" },
  ];
  const plan = planRosterChildrenSync(existing, [
    { name: "Ava  Smith", grade: "4" },
    leo,
  ]);
  assert.deepEqual(plan.updates, [{ id: "c1", name: "Ava  Smith", grade: "4" }]);
  assert.deepEqual(plan.inserts, []);
});

test("a linked child whose roster grade is unknown keeps its grade", () => {
  const existing: ExistingChildRow[] = [
    { id: "c1", external_source: "roster", external_id: "ava smith" },
  ];
  assert.deepEqual(planRosterChildrenSync(existing, [{ name: "Ava Smith", grade: null }]).updates, [
    { id: "c1", name: "Ava Smith" },
  ]);
});

test("children from another source don't count as roster links or hand-entered", () => {
  const existing: ExistingChildRow[] = [
    { id: "v1", external_source: "veracross", external_id: "123" },
  ];
  // First roster sign-in, no hand-entered children: roster children are added.
  assert.equal(planRosterChildrenSync(existing, [ava]).inserts.length, 1);
});

test("duplicate and blank roster children are ignored; invalid grades aren't written", () => {
  const plan = planRosterChildrenSync([], [ava, { name: "ava smith", grade: "5" }, { name: "  ", grade: "1" }, { name: "Zed", grade: "13" }]);
  assert.deepEqual(plan.inserts, [{ name: "Ava Smith", grade: "3", externalId: "ava smith" }]);
});

// ── roster replacement ───────────────────────────────────

test("replacing the roster inserts new, updates known and deactivates missing active parents", () => {
  const existing = new Map([
    ["keep@x.com", { id: "1", isActive: true }],
    ["back@x.com", { id: "2", isActive: false }],
    ["gone@x.com", { id: "3", isActive: true }],
    ["already-gone@x.com", { id: "4", isActive: false }],
  ]);
  assert.deepEqual(planRosterReplacement(existing, ["keep@x.com", "Back@x.com", "new@x.com"]), {
    inserted: 1,
    updated: 2,
    deactivateIds: ["3"],
  });
});
