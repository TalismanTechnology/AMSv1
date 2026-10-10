import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  buildVeracrossAuthorizeUrl,
  decideVeracrossParentAccess,
  isValidSchoolRoute,
  normalizeSignInScopes,
  parseVeracrossUserInfo,
  veracrossEndpoints,
} from "./oauth";
import {
  buildDataApiQuery,
  isCurrentStudent,
  mapVeracrossGrade,
  relatedPersonIds,
  studentDisplayName,
} from "./data-api";
import { decideLink } from "./link";
import { buildConnectionRow } from "./connection";
import { decryptToken } from "../blackbaud/crypto";
import {
  createLoginState,
  createVeracrossLoginState,
  verifyLoginState,
  verifyVeracrossLoginState,
} from "../blackbaud/state";
import {
  parentSignInHref,
  providerForStartPath,
  resolveAuthProvider,
} from "../auth/provider";

process.env.BLACKBAUD_TOKEN_ENC_KEY = crypto.randomBytes(32).toString("base64");

// ── provider ─────────────────────────────────────────────

test("anything but 'veracross' resolves to Blackbaud (incl. pre-034 schools)", () => {
  assert.equal(resolveAuthProvider("veracross"), "veracross");
  assert.equal(resolveAuthProvider("blackbaud"), "blackbaud");
  assert.equal(resolveAuthProvider(undefined), "blackbaud");
  assert.equal(resolveAuthProvider(null), "blackbaud");
  assert.equal(resolveAuthProvider("VERACROSS"), "blackbaud");
});

test("sign-in links and start paths per provider", () => {
  assert.equal(parentSignInHref("blackbaud", "acme"), "/auth/blackbaud?school=acme");
  assert.equal(parentSignInHref("veracross", "poly prep"), "/auth/veracross?school=poly%20prep");
  assert.equal(providerForStartPath("/auth/veracross"), "veracross");
  assert.equal(providerForStartPath("/auth/blackbaud"), "blackbaud");
  assert.equal(providerForStartPath("/auth/veracross/callback"), null);
});

// ── state ────────────────────────────────────────────────

test("Veracross and Blackbaud login states are not interchangeable", () => {
  const vc = createVeracrossLoginState("school-uuid", "poly", "a".repeat(43));
  const bb = createLoginState("school-uuid", "poly");

  assert.deepEqual(verifyVeracrossLoginState(vc, vc), {
    schoolId: "school-uuid",
    schoolSlug: "poly",
    appChallenge: "a".repeat(43),
  });
  assert.equal(verifyLoginState(vc, vc), null);
  assert.equal(verifyVeracrossLoginState(bb, bb), null);
  assert.equal(verifyVeracrossLoginState(vc, undefined), null);
});

// ── OAuth ────────────────────────────────────────────────

test("endpoints are scoped to the school route", () => {
  assert.deepEqual(veracrossEndpoints("api-sandbox"), {
    authorize: "https://accounts.veracross.com/api-sandbox/oauth/authorize",
    token: "https://accounts.veracross.com/api-sandbox/oauth/token",
    userinfo: "https://accounts.veracross.com/api-sandbox/oauth/userinfo",
  });
});

test("school routes can't inject paths or hosts", () => {
  assert.equal(isValidSchoolRoute("polyprep"), true);
  assert.equal(isValidSchoolRoute("api-sandbox"), true);
  for (const bad of ["", "../x", "a/b", "evil.com", "a?b", "-lead", "a b"]) {
    assert.equal(isValidSchoolRoute(bad), false, bad);
    assert.throws(() => veracrossEndpoints(bad));
  }
});

test("scopes must include sso or openid", () => {
  assert.equal(normalizeSignInScopes("sso"), "sso");
  assert.equal(normalizeSignInScopes("  openid   sso openid "), "openid sso");
  assert.throws(() => normalizeSignInScopes("students:list"));
  assert.throws(() => normalizeSignInScopes(""));
});

test("authorize URL carries the documented parameters plus state and PKCE", () => {
  const url = new URL(
    buildVeracrossAuthorizeUrl({
      client: { schoolRoute: "polyprep", clientId: "cid" },
      scopes: "sso",
      redirectUri: "https://askmyschool.app/auth/veracross/callback",
      state: "the-state",
      codeChallenge: "the-challenge",
    })
  );

  assert.equal(url.origin + url.pathname, "https://accounts.veracross.com/polyprep/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "cid");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "sso");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://askmyschool.app/auth/veracross/callback"
  );
  assert.equal(url.searchParams.get("state"), "the-state");
  assert.equal(url.searchParams.get("code_challenge"), "the-challenge");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("userinfo parses the documented shape", () => {
  const user = parseVeracrossUserInfo({
    sub: "1234",
    preferred_username: "john.doe",
    email: "john.doe@example.com",
    roles: ["Parent", "Coach"],
  });
  assert.deepEqual(user, {
    sub: "1234",
    username: "john.doe",
    email: "john.doe@example.com",
    roles: ["Parent", "Coach"],
    fullName: "",
  });

  // email and roles are nullable; numeric sub tolerated.
  const sparse = parseVeracrossUserInfo({ sub: 99, preferred_username: "x", email: null, roles: null });
  assert.equal(sparse.sub, "99");
  assert.deepEqual(sparse.roles, []);
  assert.throws(() => parseVeracrossUserInfo({ preferred_username: "nosub" }));
});

test("only configured parent roles get in, and an email is required", () => {
  const roles = ["Parent"];
  assert.deepEqual(
    decideVeracrossParentAccess({ user: { roles: ["parent", "Donor"], email: " a@b.org " }, parentRoles: roles }),
    { allowed: true, email: "a@b.org" }
  );
  assert.deepEqual(
    decideVeracrossParentAccess({ user: { roles: ["Student"], email: "a@b.org" }, parentRoles: roles }),
    { allowed: false, reason: "not_a_parent" }
  );
  assert.deepEqual(
    decideVeracrossParentAccess({ user: { roles: ["Staff", "Faculty"], email: "a@b.org" }, parentRoles: roles }),
    { allowed: false, reason: "not_a_parent" }
  );
  assert.deepEqual(
    decideVeracrossParentAccess({ user: { roles: [], email: "a@b.org" }, parentRoles: roles }),
    { allowed: false, reason: "not_a_parent" }
  );
  assert.deepEqual(
    decideVeracrossParentAccess({ user: { roles: ["Parent"], email: null }, parentRoles: roles }),
    { allowed: false, reason: "no_email" }
  );
  assert.deepEqual(
    decideVeracrossParentAccess({
      user: { roles: ["Guardian"], email: "g@b.org" },
      parentRoles: ["Parent", "Guardian"],
    }),
    { allowed: true, email: "g@b.org" }
  );
});

// ── Data API helpers ─────────────────────────────────────

test("grade levels map onto AskMySchool grades", () => {
  const level = (fields: Record<string, string>) => ({ id: "1", ...fields });
  assert.equal(mapVeracrossGrade(level({ abbreviation: "PK" })), "Pre-K");
  assert.equal(mapVeracrossGrade(level({ grade_level: "Pre-Kindergarten" })), "Pre-K");
  assert.equal(mapVeracrossGrade(level({ abbreviation: "K" })), "K");
  assert.equal(mapVeracrossGrade(level({ grade_level: "Kindergarten" })), "K");
  assert.equal(mapVeracrossGrade(level({ abbreviation: "05" })), "5");
  assert.equal(mapVeracrossGrade(level({ grade_level: "Grade 9" })), "9");
  assert.equal(mapVeracrossGrade(level({ long_description: "12th Grade" })), "12");
  assert.equal(mapVeracrossGrade(level({ abbreviation: "Gr. 3" })), "3");
  // Unknown naming keeps the school's own label.
  assert.equal(mapVeracrossGrade(level({ abbreviation: "VI", grade_level: "Form VI" })), "Form VI");
  assert.equal(mapVeracrossGrade(level({ abbreviation: "13" })), "13");
  assert.equal(mapVeracrossGrade(undefined), null);
});

test("current students only", () => {
  assert.equal(isCurrentStudent({ roles: "Student" }), true);
  assert.equal(isCurrentStudent({ roles: "Student, Athlete" }), true);
  assert.equal(isCurrentStudent({ roles: "Former Student" }), false);
  assert.equal(isCurrentStudent({ roles: "Future Student; Applicant" }), false);
  assert.equal(isCurrentStudent({ roles: null }), true);
});

test("student names prefer the preferred name", () => {
  assert.equal(
    studentDisplayName({ id: "1", first_name: "Robert", preferred_name: "Bobby", last_name: "Lee" }),
    "Bobby Lee"
  );
  assert.equal(studentDisplayName({ id: "1", first_name: "Ann", last_name: "Lee" }), "Ann Lee");
});

test("relationship rows yield related people with parent standing", () => {
  const rows = [
    { person_id: "10", related_person_id: "20", legal_custody: true },
    { person_id: "30", related_person_id: "10", parent_portal_access: true },
    { person_id: "10", related_person_id: "40", legal_custody: false, parent_portal_access: false },
    { person_id: "10", related_person_id: "50", legal_custody: true, related_person_is_deceased: true },
  ];
  assert.deepEqual(relatedPersonIds("10", rows).sort(), ["20", "30"]);
});

test("data API queries leave @ readable", () => {
  assert.equal(buildDataApiQuery({ username: "jane.doe@example.com" }), "?username=jane.doe@example.com");
  assert.equal(buildDataApiQuery({ username: "a&b=c" }), "?username=a%26b%3Dc");
  assert.equal(buildDataApiQuery({}), "");
});

// ── linking ──────────────────────────────────────────────

test("a Veracross account and an AskMySchool account pair one-to-one", () => {
  assert.deepEqual(decideLink([], "u1", "s1"), { ok: true, firstLink: true });
  assert.deepEqual(decideLink([{ user_id: "u1", account_sub: "s1" }], "u1", "s1"), {
    ok: true,
    firstLink: false,
  });
  // Same email, different Veracross person (address reassigned).
  assert.deepEqual(decideLink([{ user_id: "u1", account_sub: "s2" }], "u1", "s1"), {
    ok: false,
    reason: "account_mismatch",
  });
  // Same Veracross person, different AskMySchool account (email changed).
  assert.deepEqual(decideLink([{ user_id: "u2", account_sub: "s1" }], "u1", "s1"), {
    ok: false,
    reason: "account_mismatch",
  });
});

// ── credentials ──────────────────────────────────────────

test("connection rows store the client secret encrypted", () => {
  const row = buildConnectionRow({
    schoolId: "school-uuid",
    schoolRoute: " polyprep ",
    clientId: "cid",
    clientSecret: "super-secret",
  });

  assert.equal(row.school_route, "polyprep");
  assert.equal(row.scopes, "sso");
  assert.deepEqual(row.parent_roles, ["Parent"]);
  assert.equal(row.data_api_enabled, false);
  assert.ok(!JSON.stringify(row).includes("super-secret"));
  assert.equal(
    decryptToken({
      ciphertext: row.client_secret_ciphertext,
      iv: row.client_secret_iv,
      tag: row.client_secret_tag,
    }),
    "super-secret"
  );

  assert.throws(() =>
    buildConnectionRow({ schoolId: "s", schoolRoute: "a/b", clientId: "c", clientSecret: "x" })
  );
  assert.throws(() =>
    buildConnectionRow({ schoolId: "s", schoolRoute: "ok", clientId: "c", clientSecret: " " })
  );
  assert.throws(() =>
    buildConnectionRow({ schoolId: "s", schoolRoute: "ok", clientId: "c", clientSecret: "x", scopes: "students:list" })
  );
});
