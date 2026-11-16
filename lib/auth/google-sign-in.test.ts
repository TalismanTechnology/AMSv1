import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  GOOGLE_MESSAGES,
  decideGoogleAccess,
  googleHandoffSlug,
  hasGoogleIdentity,
  hasVerifiedGoogleEmail,
  isGoogleSignInEnabled,
  isNoAccountError,
  isPasswordSignInDisabled,
  loginPathFor,
  packGoogleIntent,
  parseGoogleHandoffSlug,
  safeNextPath,
  schoolSlugFromPath,
  sessionAuthMethods,
  unpackGoogleIntent,
  violatesPasswordPolicy,
} from "./google-sign-in";

// ─── next validation ──────────────────────────────────────────────────

test("safeNextPath keeps same-origin relative paths", () => {
  assert.equal(safeNextPath("/super-admin"), "/super-admin");
  assert.equal(safeNextPath("/s/greenwood/admin/documents"), "/s/greenwood/admin/documents");
  assert.equal(safeNextPath("/s/greenwood/admin?tab=users"), "/s/greenwood/admin?tab=users");
  assert.equal(safeNextPath("  /super-admin  "), "/super-admin");
});

test("safeNextPath rejects anything that could leave the site", () => {
  for (const value of [
    null,
    undefined,
    "",
    "super-admin",
    "https://evil.com",
    "//evil.com",
    "//evil.com/s/x/admin",
    "/\\evil.com",
    "\\\\evil.com",
    "/%0d%0aLocation:evil",
    "/\nhttps://evil.com",
    "javascript:alert(1)",
    "/auth/callback?code=x",
    "/auth/google",
    `/${"a".repeat(600)}`,
  ]) {
    const result = safeNextPath(value);
    if (result !== null) {
      // Anything kept must still resolve on our own origin.
      assert.equal(new URL(result, "https://askmyschool.app").origin, "https://askmyschool.app", String(value));
      assert.ok(!result.startsWith("//"), String(value));
    }
  }
  assert.equal(safeNextPath("https://evil.com"), null);
  assert.equal(safeNextPath("//evil.com"), null);
  assert.equal(safeNextPath("/\\evil.com"), null);
  assert.equal(safeNextPath("/\nhttps://evil.com"), null);
  assert.equal(safeNextPath("/auth/callback?code=x"), null);
  assert.equal(safeNextPath(`/${"a".repeat(600)}`), null);
});

test("schoolSlugFromPath and loginPathFor", () => {
  assert.equal(schoolSlugFromPath("/s/greenwood/admin"), "greenwood");
  assert.equal(schoolSlugFromPath("/s/greenwood"), "greenwood");
  assert.equal(schoolSlugFromPath("/super-admin"), null);
  assert.equal(schoolSlugFromPath(null), null);
  assert.equal(loginPathFor("/s/greenwood/admin"), "/s/greenwood/login");
  assert.equal(loginPathFor("/super-admin"), "/login/staff");
  assert.equal(loginPathFor(null), "/login/staff");
});

// ─── flag ─────────────────────────────────────────────────────────────

test("Google sign-in is off unless GOOGLE_SIGNIN_ENABLED is true", () => {
  assert.equal(isGoogleSignInEnabled({}), false);
  assert.equal(isGoogleSignInEnabled({ GOOGLE_SIGNIN_ENABLED: "" }), false);
  assert.equal(isGoogleSignInEnabled({ GOOGLE_SIGNIN_ENABLED: "false" }), false);
  assert.equal(isGoogleSignInEnabled({ GOOGLE_SIGNIN_ENABLED: "1" }), false);
  assert.equal(isGoogleSignInEnabled({ GOOGLE_SIGNIN_ENABLED: "yes" }), false);
  assert.equal(isGoogleSignInEnabled({ GOOGLE_SIGNIN_ENABLED: "true" }), true);
  assert.equal(isGoogleSignInEnabled({ GOOGLE_SIGNIN_ENABLED: " TRUE " }), true);
});

// ─── provider errors ──────────────────────────────────────────────────

test("Supabase's sign-ups-off refusal is recognised as an unknown account", () => {
  assert.equal(
    isNoAccountError(
      new URLSearchParams({
        error: "access_denied",
        error_code: "signup_disabled",
        error_description: "Signups not allowed for this instance",
      })
    ),
    true
  );
  assert.equal(
    isNoAccountError(new URLSearchParams({ error: "server_error", error_description: "Signups not allowed for this instance" })),
    true
  );
  assert.equal(
    isNoAccountError(new URLSearchParams({ error: "access_denied", error_description: "User cancelled" })),
    false
  );
});

// ─── identity ─────────────────────────────────────────────────────────

const googleIdentity = (email: string, verified: unknown = true) => ({
  provider: "google",
  identity_data: { email, email_verified: verified },
});

test("a verified Google identity for the account's email counts", () => {
  assert.equal(
    hasVerifiedGoogleEmail({ email: "Admin@School.org", identities: [googleIdentity("admin@school.org")] }),
    true
  );
});

test("an unverified, mismatched or missing Google identity does not count", () => {
  assert.equal(
    hasVerifiedGoogleEmail({ email: "admin@school.org", identities: [googleIdentity("admin@school.org", false)] }),
    false
  );
  assert.equal(
    hasVerifiedGoogleEmail({ email: "admin@school.org", identities: [googleIdentity("other@gmail.com")] }),
    false
  );
  assert.equal(
    hasVerifiedGoogleEmail({
      email: "admin@school.org",
      identities: [{ provider: "email", identity_data: { email: "admin@school.org", email_verified: true } }],
    }),
    false
  );
  assert.equal(hasVerifiedGoogleEmail({ email: null, identities: [googleIdentity("x@y.z")] }), false);
  assert.equal(hasVerifiedGoogleEmail({ email: "admin@school.org" }), false);
  assert.equal(hasGoogleIdentity({ identities: [googleIdentity("a@b.c")] }), true);
  assert.equal(hasGoogleIdentity({ identities: [] }), false);
});

// ─── access decision ──────────────────────────────────────────────────

const superAdmin = { profileRole: "super_admin", adminSchoolSlugs: [] };
const greenwoodAdmin = { profileRole: "parent", adminSchoolSlugs: ["greenwood"] };
const parent = { profileRole: "parent", adminSchoolSlugs: [] };

test("super-admin is allowed and lands on next or /super-admin", () => {
  assert.deepEqual(decideGoogleAccess({ emailVerified: true, access: superAdmin, next: null }), {
    allowed: true,
    destination: "/super-admin",
    schoolSlug: null,
  });
  assert.deepEqual(
    decideGoogleAccess({ emailVerified: true, access: superAdmin, next: "/s/greenwood/admin" }),
    { allowed: true, destination: "/s/greenwood/admin", schoolSlug: "greenwood" }
  );
  // A school's non-admin path still lands in its admin area (the owner lock
  // there is enforced by the school guards, not here).
  assert.deepEqual(
    decideGoogleAccess({ emailVerified: true, access: superAdmin, next: "/s/greenwood/parent/chat" }),
    { allowed: true, destination: "/s/greenwood/admin", schoolSlug: "greenwood" }
  );
});

test("school admin is allowed into their own school", () => {
  assert.deepEqual(
    decideGoogleAccess({ emailVerified: true, access: greenwoodAdmin, next: "/s/greenwood/admin/documents" }),
    { allowed: true, destination: "/s/greenwood/admin/documents", schoolSlug: "greenwood" }
  );
  // From /login/staff: their first school.
  assert.deepEqual(decideGoogleAccess({ emailVerified: true, access: greenwoodAdmin, next: null }), {
    allowed: true,
    destination: "/s/greenwood/admin",
    schoolSlug: "greenwood",
  });
  // A super-admin-only next is ignored for a school admin.
  assert.deepEqual(
    decideGoogleAccess({ emailVerified: true, access: greenwoodAdmin, next: "/super-admin" }),
    { allowed: true, destination: "/s/greenwood/admin", schoolSlug: "greenwood" }
  );
});

test("school admin is refused at a school they don't administer", () => {
  assert.deepEqual(
    decideGoogleAccess({ emailVerified: true, access: greenwoodAdmin, next: "/s/oakridge/admin" }),
    { allowed: false, message: GOOGLE_MESSAGES.notThisSchool }
  );
});

test("parents, accounts with no profile and unknown users are refused", () => {
  assert.deepEqual(decideGoogleAccess({ emailVerified: true, access: parent, next: null }), {
    allowed: false,
    message: GOOGLE_MESSAGES.noAccount,
  });
  assert.deepEqual(
    decideGoogleAccess({ emailVerified: true, access: parent, next: "/s/greenwood/admin" }),
    { allowed: false, message: GOOGLE_MESSAGES.noAccount }
  );
  assert.deepEqual(decideGoogleAccess({ emailVerified: true, access: null, next: null }), {
    allowed: false,
    message: GOOGLE_MESSAGES.noAccount,
  });
  assert.deepEqual(
    decideGoogleAccess({ emailVerified: true, access: { profileRole: null, adminSchoolSlugs: [] }, next: null }),
    { allowed: false, message: GOOGLE_MESSAGES.noAccount }
  );
});

test("an unverified Google email is refused, even for a super-admin", () => {
  assert.deepEqual(decideGoogleAccess({ emailVerified: false, access: superAdmin, next: null }), {
    allowed: false,
    message: GOOGLE_MESSAGES.unverified,
  });
});

// ─── native handoff + intent cookie ───────────────────────────────────

test("Google handoffs are told apart from parent handoffs", () => {
  assert.deepEqual(parseGoogleHandoffSlug(googleHandoffSlug("greenwood")), { schoolSlug: "greenwood" });
  assert.deepEqual(parseGoogleHandoffSlug(googleHandoffSlug(null)), { schoolSlug: null });
  assert.deepEqual(parseGoogleHandoffSlug("google:../evil"), { schoolSlug: null });
  assert.equal(parseGoogleHandoffSlug("greenwood"), null);
});

test("the intent cookie round-trips and re-validates its contents", () => {
  const challenge = "a".repeat(43);
  assert.deepEqual(unpackGoogleIntent(packGoogleIntent({ next: "/s/greenwood/admin", appChallenge: challenge })), {
    next: "/s/greenwood/admin",
    appChallenge: challenge,
  });
  assert.deepEqual(unpackGoogleIntent(packGoogleIntent({ next: null, appChallenge: null })), {
    next: null,
    appChallenge: null,
  });
  assert.deepEqual(unpackGoogleIntent("next=%2F%2Fevil.com&app=short"), { next: null, appChallenge: null });
  assert.equal(unpackGoogleIntent(undefined), null);
});

// ─── require Google (password sign-in off) ────────────────────────────

function jwtWithAmr(methods: string[]): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc({ sub: "u", amr: methods.map((method) => ({ method, timestamp: 1 })) })}.sig`;
}

test("sessionAuthMethods reads the amr claim", () => {
  assert.deepEqual(sessionAuthMethods(jwtWithAmr(["password"])), ["password"]);
  assert.deepEqual(sessionAuthMethods(jwtWithAmr(["oauth"])), ["oauth"]);
  assert.deepEqual(sessionAuthMethods("not-a-jwt"), []);
  assert.deepEqual(sessionAuthMethods(undefined), []);
});

test("password-disabled accounts reject password sessions only", () => {
  const disabled = { password_signin_disabled: true };
  assert.equal(isPasswordSignInDisabled(disabled), true);
  assert.equal(isPasswordSignInDisabled({ password_signin_disabled: "true" }), false);
  assert.equal(isPasswordSignInDisabled({}), false);
  assert.equal(isPasswordSignInDisabled(undefined), false);

  assert.equal(
    violatesPasswordPolicy({ googleEnabled: true, appMetadata: disabled, authMethods: ["password"] }),
    true
  );
  assert.equal(
    violatesPasswordPolicy({ googleEnabled: true, appMetadata: disabled, authMethods: ["oauth"] }),
    false
  );
  // The native app's handoff session is a one-time token, not a password.
  assert.equal(
    violatesPasswordPolicy({ googleEnabled: true, appMetadata: disabled, authMethods: ["otp"] }),
    false
  );
  assert.equal(
    violatesPasswordPolicy({ googleEnabled: true, appMetadata: {}, authMethods: ["password"] }),
    false
  );
  // Flag off is the escape hatch: password sign-in works again.
  assert.equal(
    violatesPasswordPolicy({ googleEnabled: false, appMetadata: disabled, authMethods: ["password"] }),
    false
  );
});

// ─── where the button may appear ──────────────────────────────────────

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

test("parent sign-in pages never render the Google button", () => {
  for (const file of [
    "app/login/page.tsx",
    "components/auth/parent-sign-in-button.tsx",
    "components/auth/roster-sign-in-form.tsx",
  ]) {
    assert.doesNotMatch(read(file), /GoogleSignInButton|\/auth\/google/, file);
  }
});

test("the school login page offers Google only in the staff section, behind the flag", () => {
  const source = read("app/s/[slug]/(auth)/login/login-form.tsx");
  const uses = source.match(/<GoogleSignInButton/g) ?? [];
  assert.equal(uses.length, 1);
  assert.match(source, /\{showStaffSignIn && googleSignInEnabled && \(\s*<>\s*<GoogleSignInButton/);
  assert.match(
    source,
    /const googleSignInEnabled = staffSignIn === "google-only" \|\| staffSignIn === "google-and-password";/
  );
  assert.match(read("app/s/[slug]/(auth)/login/page.tsx"), /staffSignIn=\{staffSignInMode\(\)\}/);
});

test("the staff login page renders Google only behind the flag", () => {
  const source = read("app/login/staff/staff-login-form.tsx");
  assert.match(source, /\{showGoogle && \(\s*<>\s*<GoogleSignInButton/);
  assert.match(source, /const showGoogle = mode === "google-only" \|\| mode === "google-and-password";/);
  assert.match(read("app/login/staff/page.tsx"), /mode=\{staffSignInMode\(\)\}/);
});
