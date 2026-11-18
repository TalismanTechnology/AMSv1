import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ADMIN_GOOGLE_ONLY_LOGIN_PATH,
  ADMIN_GOOGLE_ONLY_MESSAGE,
  accessTokenSession,
  adminsLockedOut,
  decideAdminSession,
  decideSchoolAdminSession,
  isAdminCapableIn,
  isAdminGoogleOnlyEnabled,
  sessionIdFromAccessToken,
  staffSignInMode,
} from "./admin-google-only";
import { isParentHandoffSlug } from "./app-handoff";
import { googleHandoffSlug, parseGoogleHandoffSlug } from "./google-sign-in";

// The pure half of ADMIN_GOOGLE_ONLY (lib/auth/admin-google-only.ts), plus
// source-level checks that every admin guard goes through it.

const USER = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";

function jwt(claims: Record<string, unknown>): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(claims)}.sig`;
}

// ─── flag ─────────────────────────────────────────────────────────────

test("ADMIN_GOOGLE_ONLY is off unless exactly \"true\"", () => {
  assert.equal(isAdminGoogleOnlyEnabled({}), false);
  assert.equal(isAdminGoogleOnlyEnabled({ ADMIN_GOOGLE_ONLY: "" }), false);
  assert.equal(isAdminGoogleOnlyEnabled({ ADMIN_GOOGLE_ONLY: "false" }), false);
  assert.equal(isAdminGoogleOnlyEnabled({ ADMIN_GOOGLE_ONLY: "1" }), false);
  assert.equal(isAdminGoogleOnlyEnabled({ ADMIN_GOOGLE_ONLY: "yes" }), false);
  assert.equal(isAdminGoogleOnlyEnabled({ ADMIN_GOOGLE_ONLY: "TRUE" }), false);
  assert.equal(isAdminGoogleOnlyEnabled({ ADMIN_GOOGLE_ONLY: "true" }), true);
  assert.equal(isAdminGoogleOnlyEnabled({ ADMIN_GOOGLE_ONLY: " true\n" }), true);
});

test("ADMIN_GOOGLE_ONLY without Google sign-in locks admins out, and says so", () => {
  assert.equal(adminsLockedOut({ ADMIN_GOOGLE_ONLY: "true" }), true);
  assert.equal(adminsLockedOut({ ADMIN_GOOGLE_ONLY: "true", GOOGLE_SIGNIN_ENABLED: "false" }), true);
  assert.equal(adminsLockedOut({ ADMIN_GOOGLE_ONLY: "true", GOOGLE_SIGNIN_ENABLED: "true" }), false);
  assert.equal(adminsLockedOut({ GOOGLE_SIGNIN_ENABLED: "false" }), false);
  assert.equal(adminsLockedOut({}), false);
});

test("staff sign-in offers only Google when both flags are on", () => {
  assert.equal(staffSignInMode({}), "password");
  assert.equal(staffSignInMode({ GOOGLE_SIGNIN_ENABLED: "true" }), "google-and-password");
  assert.equal(
    staffSignInMode({ GOOGLE_SIGNIN_ENABLED: "true", ADMIN_GOOGLE_ONLY: "true" }),
    "google-only"
  );
  // No silent fallback to passwords.
  assert.equal(staffSignInMode({ ADMIN_GOOGLE_ONLY: "true" }), "unavailable");
});

test("the refusal sends admins to staff sign-in with the message", () => {
  const url = new URL(ADMIN_GOOGLE_ONLY_LOGIN_PATH, "https://askmyschool.app");
  assert.equal(url.pathname, "/login/staff");
  assert.equal(url.searchParams.get("error"), ADMIN_GOOGLE_ONLY_MESSAGE);
  assert.match(ADMIN_GOOGLE_ONLY_MESSAGE, /Google/);
});

// ─── decision matrix ──────────────────────────────────────────────────

test("flag off: admin powers apply exactly as before, whatever the session", () => {
  for (const isAdminCapable of [true, false]) {
    for (const sessionIsGoogle of [true, false]) {
      for (const hasParentFallback of [true, false]) {
        assert.equal(
          decideAdminSession({ enabled: false, isAdminCapable, sessionIsGoogle, hasParentFallback }),
          "allow"
        );
      }
    }
  }
  for (const isSuperAdmin of [true, false]) {
    for (const role of ["admin", "parent", null]) {
      assert.equal(
        decideSchoolAdminSession({
          enabled: false,
          isSuperAdmin,
          membership: role ? { role } : null,
          sessionIsGoogle: false,
        }),
        "allow"
      );
    }
  }
});

test("flag on: a Google session (web or app) keeps admin and super-admin powers", () => {
  for (const [isSuperAdmin, membership] of [
    [true, null],
    [true, { role: "parent" }],
    [true, { role: "admin" }],
    [false, { role: "admin" }],
  ] as const) {
    assert.equal(
      decideSchoolAdminSession({ enabled: true, isSuperAdmin, membership, sessionIsGoogle: true }),
      "allow"
    );
  }
});

test("flag on: password / email-code / magic-link sessions lose admin and super-admin powers", () => {
  // Every non-Google session looks the same here: no google_auth_sessions row.
  assert.equal(
    decideSchoolAdminSession({
      enabled: true,
      isSuperAdmin: false,
      membership: { role: "admin" },
      sessionIsGoogle: false,
    }),
    "require-google"
  );
  assert.equal(
    decideSchoolAdminSession({ enabled: true, isSuperAdmin: true, membership: null, sessionIsGoogle: false }),
    "require-google"
  );
});

test("flag on: parents are unaffected", () => {
  for (const sessionIsGoogle of [true, false]) {
    assert.equal(
      decideSchoolAdminSession({
        enabled: true,
        isSuperAdmin: false,
        membership: { role: "parent" },
        sessionIsGoogle,
      }),
      "allow"
    );
    assert.equal(
      decideSchoolAdminSession({ enabled: true, isSuperAdmin: false, membership: null, sessionIsGoogle }),
      "allow"
    );
  }
});

test("flag on: an admin of one school is still a parent at another", () => {
  // At the school where they're a parent they aren't admin-capable at all.
  assert.equal(isAdminCapableIn(false, { role: "parent" }), false);
  assert.equal(
    decideSchoolAdminSession({
      enabled: true,
      isSuperAdmin: false,
      membership: { role: "parent" },
      sessionIsGoogle: false,
    }),
    "allow"
  );
});

test("flag on: a super-admin who is also a parent is not treated as a parent", () => {
  // RLS (is_super_admin()) would still give the session every school's data.
  assert.equal(
    decideSchoolAdminSession({
      enabled: true,
      isSuperAdmin: true,
      membership: { role: "parent" },
      sessionIsGoogle: false,
    }),
    "require-google"
  );
});

test("the generic decision falls back to a parent membership when there is one", () => {
  assert.equal(
    decideAdminSession({ enabled: true, isAdminCapable: true, sessionIsGoogle: false, hasParentFallback: true }),
    "parent-only"
  );
  assert.equal(
    decideAdminSession({ enabled: true, isAdminCapable: true, sessionIsGoogle: false }),
    "require-google"
  );
});

// ─── session id ───────────────────────────────────────────────────────

test("the session id and user come from the access token's claims", () => {
  const token = jwt({ sub: USER, session_id: SESSION, amr: [{ method: "otp" }] });
  assert.deepEqual(accessTokenSession(token), { sessionId: SESSION, userId: USER });
  assert.equal(sessionIdFromAccessToken(token), SESSION);
  assert.equal(
    sessionIdFromAccessToken(jwt({ sub: USER, session_id: SESSION.toUpperCase() })),
    SESSION
  );
});

test("tokens without a usable session id are refused", () => {
  assert.equal(accessTokenSession(jwt({ sub: USER })), null);
  assert.equal(accessTokenSession(jwt({ sub: USER, session_id: "not-a-uuid" })), null);
  assert.equal(accessTokenSession(jwt({ sub: USER, session_id: 42 })), null);
  assert.equal(accessTokenSession(jwt({ session_id: SESSION })), null);
  assert.equal(accessTokenSession("not-a-jwt"), null);
  assert.equal(accessTokenSession("a.!!!.c"), null);
  assert.equal(accessTokenSession(undefined), null);
  assert.equal(accessTokenSession(null), null);
});

// ─── native handoff ───────────────────────────────────────────────────

test("a Blackbaud / Veracross handoff can never carry a Google slug", () => {
  assert.equal(isParentHandoffSlug("greenwood"), true);
  assert.equal(isParentHandoffSlug("st-marys-2"), true);
  assert.equal(isParentHandoffSlug(googleHandoffSlug("greenwood")), false);
  assert.equal(isParentHandoffSlug(googleHandoffSlug(null)), false);
  assert.equal(isParentHandoffSlug(""), false);
  // Only "google:" handoffs are treated as staff Google sign-ins.
  assert.equal(parseGoogleHandoffSlug("greenwood"), null);
});

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

test("only the Google callback mints Google handoffs", () => {
  for (const file of ["app/auth/blackbaud/callback/route.ts", "app/auth/veracross/callback/route.ts"]) {
    const source = read(file);
    assert.doesNotMatch(source, /createGoogleAppHandoff|googleHandoffSlug|google:/, file);
    assert.match(source, /createAppHandoff\(/, file);
  }
  const callback = read("app/auth/callback/route.ts");
  assert.match(callback, /createGoogleAppHandoff\(/);
  assert.doesNotMatch(callback, /createAppHandoff\(/);
  // createAppHandoff refuses anything that isn't a school slug.
  assert.match(read("lib/auth/app-handoff.ts"), /if \(!isParentHandoffSlug\(input\.schoolSlug\)\)/);
});

// ─── wiring ───────────────────────────────────────────────────────────

test("the shared guards consult ADMIN_GOOGLE_ONLY", () => {
  assert.match(read("lib/school-context.ts"), /adminSessionDecision\(/);
  assert.match(read("lib/school-context.ts"), /redirect\(ADMIN_GOOGLE_ONLY_LOGIN_PATH\)/);
  const requireAdmin = read("lib/auth/require-school-admin.ts");
  assert.match(requireAdmin, /adminGoogleOnlyError\(/);
  assert.match(requireAdmin, /superAdminGoogleOnlyError\(/);
  assert.match(read("lib/school-lock/access.ts"), /adminGoogleOnlyError\(/);
  assert.match(read("app/super-admin/layout.tsx"), /superAdminGoogleOnlyError\(user\.id\)/);
});

test("every super-admin action checks the session", () => {
  const source = read("actions/super-admin.ts");
  const roleChecks = source.match(/profile\?\.role !== "super_admin"\) return/g) ?? [];
  const googleChecks = source.match(/superAdminGoogleOnlyError\(user\.id\)/g) ?? [];
  assert.ok(roleChecks.length >= 5);
  assert.equal(googleChecks.length, roleChecks.length);
  assert.match(read("actions/school-lock.ts"), /superAdminGoogleOnlyError\(user\.id\)/);
  assert.match(read("actions/school-lock.ts"), /adminGoogleOnlyError\(\{ userId: user\.id, isSuperAdmin: false/);
});

test("action and route guards with their own role checks consult it", () => {
  // Local admin guards: schoolLockError (via assertSchoolNotLocked) now
  // covers admin members too, so it must run on that branch as well.
  for (const file of ["actions/dev-panel.ts", "actions/sorting.ts"]) {
    const source = read(file);
    const afterMemberCheck = source.slice(source.search(/role !== "admin"/));
    assert.match(afterMemberCheck, /assertSchoolNotLocked\(schoolId, "admin", user\.id\)/, file);
  }
  assert.match(read("actions/chat.ts"), /adminGoogleOnlyError\(/);
  assert.match(read("app/api/chat/route.ts"), /adminGoogleOnlyError\(/);
  const connect = read("app/api/blackbaud/connect/route.ts");
  assert.doesNotMatch(connect, /\} else \{\s*const locked/);
  assert.match(connect, /schoolAccessErrorStatus\(locked\)/);
  for (const name of ["content", "source", "status", "url"]) {
    assert.match(read(`app/api/documents/[id]/${name}/route.ts`), /schoolAccessErrorStatus\(locked\)/);
  }
  assert.match(read("actions/auth.ts"), /if \(isAdminGoogleOnlyEnabled\(\)\) \{/);
  assert.match(read("actions/account.ts"), /currentSessionIsGoogle\(user\.id\)/);
});

test("Google sessions are recorded where they start", () => {
  assert.match(read("app/auth/callback/route.ts"), /recordGoogleSession\(\{[\s\S]*?via: "web"/);
  assert.match(read("app/auth/app-handoff/route.ts"), /recordGoogleSession\(\{[\s\S]*?via: "app"/);
});

test("the staff login forms keep the password form for parents only in google-only mode", () => {
  // Rendered and clicked through in parent-password-link.test.tsx.
  const staff = read("app/login/staff/staff-login-form.tsx");
  assert.match(staff, /const passwordForm = staffPasswordForm\(mode\);/);
  assert.match(staff, /const showPassword = passwordForm === "open" \|\| showParentPassword;/);
  assert.match(staff, /\{showPassword && \(\s*<form/);
  assert.match(staff, /Admins sign in with Google\./);
  assert.match(read("app/login/staff/page.tsx"), /mode=\{staffSignInMode\(\)\}/);

  const school = read("app/s/[slug]/(auth)/login/login-form.tsx");
  assert.match(school, /const passwordForm = staffPasswordForm\(staffSignIn\);/);
  assert.match(school, /\{showStaffSignIn && staffPasswordShown && \(\s*<form/);
  assert.match(school, /Admins sign in with Google\./);
  assert.match(read("app/s/[slug]/(auth)/login/page.tsx"), /staffSignIn=\{staffSignInMode\(\)\}/);
});

test("migration 053 keeps google_auth_sessions service-role only", () => {
  const migration = read("supabase/migrations/053_google_auth_sessions.sql");
  assert.match(migration, /ALTER TABLE public\.google_auth_sessions ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.google_auth_sessions FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(migration, /CREATE POLICY/i);
});
