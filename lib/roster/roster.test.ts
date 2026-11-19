import test from "node:test";
import assert from "node:assert/strict";
import { decideRosterGate, isRosterMatchRequired, rosterGateMessage } from "./gate";
import { planRosterReplacement } from "./store";
import {
  AUTH_PROVIDERS,
  SELECTABLE_AUTH_PROVIDERS,
  isRetiredAuthProvider,
  isSelectableAuthProvider,
  parentSignInHref,
  providerForStartPath,
  resolveAuthProvider,
} from "../auth/provider";

// ── provider ─────────────────────────────────────────────

test("a leftover 'roster' value resolves to the retired roster provider; unknown values stay Blackbaud", () => {
  assert.equal(resolveAuthProvider("roster"), "roster");
  assert.equal(resolveAuthProvider("ROSTER"), "blackbaud");
  assert.equal(resolveAuthProvider("email"), "blackbaud");
  assert.equal(resolveAuthProvider(undefined), "blackbaud");
});

test("email-code (roster) sign-in is retired: not selectable, no start path", () => {
  assert.deepEqual([...SELECTABLE_AUTH_PROVIDERS], ["blackbaud", "veracross"]);
  assert.equal(isSelectableAuthProvider("roster"), false);
  assert.equal(isRetiredAuthProvider("roster"), true);
  assert.equal(isRetiredAuthProvider("blackbaud"), false);
  assert.equal(isRetiredAuthProvider("veracross"), false);
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
