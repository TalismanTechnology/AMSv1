import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTH_COOKIE_MAX_AGE_SECONDS,
  authCookieOptions,
  isAuthCookieName,
} from "./cookie-options";

test("auth cookies last 400 days, the longest browsers allow", () => {
  assert.equal(AUTH_COOKIE_MAX_AGE_SECONDS, 34_560_000);
  assert.equal(authCookieOptions("production").maxAge, 34_560_000);
});

test("auth cookies are site-wide and lax", () => {
  const options = authCookieOptions("production");
  assert.equal(options.path, "/");
  assert.equal(options.sameSite, "lax");
});

test("auth cookies are secure in production only", () => {
  assert.equal(authCookieOptions("production").secure, true);
  assert.equal(authCookieOptions("development").secure, false);
  assert.equal(authCookieOptions("test").secure, false);
});

test("auth cookie options never rename the cookie", () => {
  // A name here would change the storage key and orphan every session.
  assert.equal(authCookieOptions("production").name, undefined);
});

test("session cookies are recognised whole or chunked", () => {
  assert.equal(isAuthCookieName("sb-abcdef-auth-token"), true);
  assert.equal(isAuthCookieName("sb-abcdef-auth-token.0"), true);
  assert.equal(isAuthCookieName("sb-abcdef-auth-token.12"), true);
});

test("other cookies are not session cookies", () => {
  assert.equal(isAuthCookieName("sb-abcdef-auth-token-code-verifier"), false);
  assert.equal(isAuthCookieName("sb-abcdef-auth-token.x"), false);
  assert.equal(isAuthCookieName("bb_login"), false);
  assert.equal(isAuthCookieName("auth-token"), false);
});
