import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  buildParentAuthorizeUrl,
  createPkcePair,
  decideParentAccess,
} from "./parent-login";
import {
  createLoginState,
  createOAuthState,
  packLoginCookie,
  unpackLoginCookie,
  verifyLoginState,
  verifyOAuthState,
} from "./state";

// Read at call time, so setting them here is enough.
process.env.BLACKBAUD_TOKEN_ENC_KEY = crypto.randomBytes(32).toString("base64");
process.env.BLACKBAUD_CLIENT_ID = "client-123";
process.env.BLACKBAUD_CLIENT_SECRET = "secret";
process.env.BLACKBAUD_SUBSCRIPTION_KEY = "sub-key";

test("login state verifies when the cookie matches", () => {
  const state = createLoginState("school-uuid", "acme");
  const verified = verifyLoginState(state, state);

  assert.equal(verified?.schoolId, "school-uuid");
  assert.equal(verified?.schoolSlug, "acme");
});

test("login state is rejected without the binding cookie", () => {
  const state = createLoginState("school-uuid", "acme");
  assert.equal(verifyLoginState(state, undefined), null);
});

test("an admin connect state can't be used to sign a parent in", () => {
  const connectState = createOAuthState("school-uuid", "acme");
  assert.equal(verifyLoginState(connectState, connectState), null);
});

test("a parent login state can't be used to connect a school", () => {
  const loginState = createLoginState("school-uuid", "acme");
  assert.equal(verifyOAuthState(loginState, loginState), null);
});

test("login cookie round-trips state and verifier", () => {
  const state = createLoginState("school-uuid", "acme");
  const { verifier } = createPkcePair();

  assert.deepEqual(unpackLoginCookie(packLoginCookie(state, verifier)), {
    state,
    verifier,
  });
});

test("malformed login cookies are rejected", () => {
  assert.equal(unpackLoginCookie(undefined), null);
  assert.equal(unpackLoginCookie(""), null);
  assert.equal(unpackLoginCookie("state-only"), null);
  assert.equal(unpackLoginCookie("a~b~c"), null);
});

test("PKCE challenge is the S256 hash of the verifier", () => {
  const { verifier, challenge } = createPkcePair();
  const expected = crypto.createHash("sha256").update(verifier).digest("base64url");

  assert.equal(challenge, expected);
  assert.ok(verifier.length >= 43, "RFC 7636 requires at least 43 characters");
});

test("each PKCE pair is fresh", () => {
  assert.notEqual(createPkcePair().verifier, createPkcePair().verifier);
});

test("authorize URL carries PKCE, state and the redirect", () => {
  const url = new URL(
    buildParentAuthorizeUrl("the-state", "the-challenge", "https://app.test/auth/blackbaud/callback")
  );

  assert.equal(url.origin + url.pathname, "https://app.blackbaud.com/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "client-123");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge"), "the-challenge");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "the-state");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://app.test/auth/blackbaud/callback"
  );
});

test("a parent in the right environment is allowed", () => {
  assert.deepEqual(
    decideParentAccess({
      schoolEnvironmentId: "env-1",
      tokenEnvironmentId: "env-1",
      isParent: true,
    }),
    { allowed: true }
  );
});

test("someone the school doesn't mark as a parent is refused", () => {
  assert.deepEqual(
    decideParentAccess({
      schoolEnvironmentId: "env-1",
      tokenEnvironmentId: "env-1",
      isParent: false,
    }),
    { allowed: false, reason: "not_a_parent" }
  );
});

test("a sign-in from another school's Blackbaud is refused even for a parent", () => {
  assert.deepEqual(
    decideParentAccess({
      schoolEnvironmentId: "env-1",
      tokenEnvironmentId: "env-2",
      isParent: true,
    }),
    { allowed: false, reason: "wrong_environment" }
  );
});

test("a missing environment on either side is refused", () => {
  for (const [school, token] of [
    [null, "env-1"],
    ["env-1", null],
    ["env-1", undefined],
  ] as const) {
    assert.equal(
      decideParentAccess({
        schoolEnvironmentId: school,
        tokenEnvironmentId: token,
        isParent: true,
      }).allowed,
      false
    );
  }
});
