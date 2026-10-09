import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// End-to-end check of updateSession with Supabase's HTTP API stubbed out:
// an expired session is refreshed during getUser(), and the redirect the
// middleware then returns must carry the rotated session cookies. Before the
// fix the redirect dropped them, so the browser kept the retired refresh
// token and the user was signed out on the next refresh.

const SUPABASE_URL = "https://testref.supabase.co";
const SITE = "https://askmyschool.app";
const COOKIE = "sb-testref-auth-token";

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "parent@example.com",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

function fakeJwt(expSeconds: number): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({
    sub: USER.id,
    exp: expSeconds,
    role: "authenticated",
  })}.sig`;
}

function sessionCookieValue(session: object): string {
  return "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
}

function decodeSessionCookie(value: string): { refresh_token: string } {
  assert.ok(value.startsWith("base64-"), "session cookie is base64-encoded");
  return JSON.parse(Buffer.from(value.slice("base64-".length), "base64url").toString());
}

type Handler = (url: URL, init?: RequestInit) => Response | undefined;

function stubFetch(handler: Handler): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const res = handler(url, init);
    if (!res) throw new Error(`unexpected fetch ${url.href}`);
    return res;
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function sessionRequest(path: string, expiresAt: number): NextRequest {
  const request = new NextRequest(`${SITE}${path}`);
  request.cookies.set(
    COOKIE,
    sessionCookieValue({
      access_token: fakeJwt(expiresAt),
      refresh_token: "old-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: expiresAt,
      user: USER,
    })
  );
  return request;
}

test("a redirect after a session refresh carries the rotated, long-lived cookie", async () => {
  let refreshCalls = 0;
  const restore = stubFetch((url) => {
    if (url.pathname === "/auth/v1/token") {
      refreshCalls++;
      const future = Math.floor(Date.now() / 1000) + 3600;
      return json({
        access_token: fakeJwt(future),
        refresh_token: "new-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: future,
        user: USER,
      });
    }
    if (url.pathname === "/auth/v1/user") return json(USER);
    // Signed in but not a super admin → middleware redirects to "/".
    if (url.pathname === "/rest/v1/profiles") return json({ role: "parent" });
    return undefined;
  });

  try {
    const { updateSession } = await import("./middleware");
    const past = Math.floor(Date.now() / 1000) - 3600;
    const response = await updateSession(sessionRequest("/super-admin", past));

    assert.equal(refreshCalls, 1, "the expired session was refreshed");
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location")!).pathname, "/");

    const sessionCookies = response.cookies
      .getAll()
      .filter((c) => c.name.startsWith(COOKIE) && c.value);
    assert.ok(sessionCookies.length > 0, "redirect sets the refreshed session cookie");
    const joined = sessionCookies
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((c) => c.value)
      .join("");
    assert.equal(decodeSessionCookie(joined).refresh_token, "new-refresh-token");

    for (const c of sessionCookies) {
      assert.equal(c.maxAge, 400 * 24 * 60 * 60, `${c.name} is persistent for 400 days`);
      assert.equal(c.path, "/");
      assert.equal(c.sameSite, "lax");
      assert.notEqual(c.httpOnly, true);
    }
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  } finally {
    restore();
  }
});

test("Supabase Auth being unreachable does not bounce a signed-in user to login", async () => {
  const restore = stubFetch(() => {
    throw new TypeError("fetch failed");
  });

  try {
    const { updateSession } = await import("./middleware");
    // A still-valid access token, so getUser() goes straight to /user (an
    // expired one would also work but auth-js backs off for ~25s first).
    const future = Math.floor(Date.now() / 1000) + 3600;
    const response = await updateSession(sessionRequest("/super-admin", future));

    // No access is granted (not a pass-through), but no redirect to sign-in
    // either: a retrying 503, with the existing cookies left alone.
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("location"), null);
    assert.equal(
      response.cookies.getAll().filter((c) => c.name.startsWith(COOKIE) && !c.value).length,
      0,
      "session cookies are not cleared"
    );
  } finally {
    restore();
  }
});

test("a genuinely signed-out visitor is still redirected", async () => {
  const restore = stubFetch(() => undefined);
  try {
    const { updateSession } = await import("./middleware");
    const response = await updateSession(new NextRequest(`${SITE}/super-admin`));
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location")!).pathname, "/");
  } finally {
    restore();
  }
});
