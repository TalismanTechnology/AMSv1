import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";

import {
  AUTH_NO_STORE_CACHE_CONTROL,
  copyResponseCookies,
  isTransientAuthError,
} from "./response-cookies";
import { authCookieOptions } from "./cookie-options";

const SITE = "https://askmyschool.app";

// What the middleware's setAll leaves behind after getUser() rotates the
// refresh token.
function refreshedSessionResponse(): NextResponse {
  const request = new NextRequest(`${SITE}/login`);
  const response = NextResponse.next({ request });
  response.cookies.set("sb-ref-auth-token.0", "new-session-part-0", authCookieOptions("production"));
  response.cookies.set("sb-ref-auth-token.1", "new-session-part-1", authCookieOptions("production"));
  response.cookies.set("sb-ref-auth-token", "", { ...authCookieOptions("production"), maxAge: 0 });
  return response;
}

test("a redirect carries the refreshed session cookies", () => {
  const redirect = copyResponseCookies(
    refreshedSessionResponse(),
    NextResponse.redirect(`${SITE}/s/demo/parent`)
  );

  assert.equal(redirect.status, 307);
  assert.equal(redirect.headers.get("location"), `${SITE}/s/demo/parent`);
  assert.equal(redirect.cookies.get("sb-ref-auth-token.0")?.value, "new-session-part-0");
  assert.equal(redirect.cookies.get("sb-ref-auth-token.1")?.value, "new-session-part-1");
});

test("cookie options survive the copy", () => {
  const redirect = copyResponseCookies(
    refreshedSessionResponse(),
    NextResponse.redirect(`${SITE}/s/demo/parent`)
  );

  const cookie = redirect.cookies.get("sb-ref-auth-token.0");
  assert.equal(cookie?.maxAge, 34_560_000);
  assert.equal(cookie?.path, "/");
  assert.equal(cookie?.sameSite, "lax");
  assert.equal(cookie?.secure, true);

  const header = redirect.headers.getSetCookie().find((c) => c.startsWith("sb-ref-auth-token.0="));
  assert.match(header ?? "", /Max-Age=34560000/);
  assert.match(header ?? "", /Path=\//);
  assert.match(header ?? "", /Secure/);
});

test("deletions are copied too, so stale unchunked cookies are cleared", () => {
  const redirect = copyResponseCookies(
    refreshedSessionResponse(),
    NextResponse.redirect(`${SITE}/s/demo/parent`)
  );

  assert.equal(redirect.cookies.get("sb-ref-auth-token")?.maxAge, 0);
});

test("responses that set auth cookies are not cacheable", () => {
  const redirect = copyResponseCookies(
    refreshedSessionResponse(),
    NextResponse.redirect(`${SITE}/s/demo/parent`)
  );

  assert.equal(redirect.headers.get("cache-control"), AUTH_NO_STORE_CACHE_CONTROL);
});

test("nothing to copy leaves the redirect untouched", () => {
  const request = new NextRequest(`${SITE}/register`);
  const redirect = copyResponseCookies(
    NextResponse.next({ request }),
    NextResponse.redirect(`${SITE}/login`)
  );

  assert.equal(redirect.cookies.getAll().length, 0);
  assert.equal(redirect.headers.get("cache-control"), null);
});

test("cookies already on the target are kept", () => {
  const target = NextResponse.redirect(`${SITE}/s/demo/parent`);
  target.cookies.set("other", "kept");

  copyResponseCookies(refreshedSessionResponse(), target);

  assert.equal(target.cookies.get("other")?.value, "kept");
  assert.equal(target.cookies.get("sb-ref-auth-token.0")?.value, "new-session-part-0");
});

test("network failures and server errors are transient", () => {
  assert.equal(isTransientAuthError({ name: "AuthRetryableFetchError", status: 0 }), true);
  assert.equal(isTransientAuthError({ name: "AuthRetryableFetchError", status: 503 }), true);
  assert.equal(isTransientAuthError({ name: "AuthApiError", status: 500 }), true);
});

test("a missing or invalid session is not transient", () => {
  assert.equal(isTransientAuthError(null), false);
  assert.equal(isTransientAuthError(undefined), false);
  assert.equal(isTransientAuthError({ name: "AuthSessionMissingError", status: 400 }), false);
  assert.equal(isTransientAuthError({ name: "AuthApiError", status: 401 }), false);
  assert.equal(isTransientAuthError({ name: "AuthApiError", status: 403 }), false);
});
