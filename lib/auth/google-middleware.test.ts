import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// updateSession (lib/supabase/middleware.ts) with Supabase's HTTP API stubbed:
// "Require Google sign-in" ends password sessions, and a Google sign-in that
// Supabase sent back to the Site URL is forwarded to /auth/callback.

const SUPABASE_URL = "https://testref.supabase.co";
const SITE = "https://askmyschool.app";
const COOKIE = "sb-testref-auth-token";

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

const USER = {
  id: "22222222-2222-4222-8222-222222222222",
  aud: "authenticated",
  role: "authenticated",
  email: "lucas@example.com",
  app_metadata: { password_signin_disabled: true },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

function jwt(amr: string[]): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({
    sub: USER.id,
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "authenticated",
    amr: amr.map((method) => ({ method, timestamp: 1 })),
  })}.sig`;
}

function sessionRequest(path: string, amr: string[]): NextRequest {
  const request = new NextRequest(`${SITE}${path}`);
  const session = {
    access_token: jwt(amr),
    refresh_token: "refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: USER,
  };
  request.cookies.set(COOKIE, "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"));
  return request;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stubSupabase(): { restore: () => void; logouts: () => number } {
  const original = globalThis.fetch;
  let logouts = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === "/auth/v1/user") return json(USER);
    if (url.pathname === "/auth/v1/logout") {
      logouts++;
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/rest/v1/profiles") return json({ role: "super_admin" });
    throw new Error(`unexpected fetch ${url.href}`);
  }) as typeof fetch;
  return {
    restore: () => {
      globalThis.fetch = original;
    },
    logouts: () => logouts,
  };
}

async function withFlag<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const previous = process.env.GOOGLE_SIGNIN_ENABLED;
  if (value === undefined) delete process.env.GOOGLE_SIGNIN_ENABLED;
  else process.env.GOOGLE_SIGNIN_ENABLED = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_SIGNIN_ENABLED;
    else process.env.GOOGLE_SIGNIN_ENABLED = previous;
  }
}

test("a password session on a Google-only account is signed out", async () => {
  const stub = stubSupabase();
  try {
    await withFlag("true", async () => {
      const { updateSession } = await import("@/lib/supabase/middleware");
      const response = await updateSession(sessionRequest("/super-admin", ["password"]));

      assert.equal(response.status, 307);
      const location = new URL(response.headers.get("location")!);
      assert.equal(location.pathname, "/login/staff");
      assert.equal(location.searchParams.get("error"), "This account signs in with Google.");
      assert.equal(stub.logouts(), 1, "the session was revoked");
      const cleared = response.cookies.getAll().filter((c) => c.name.startsWith(COOKIE) && !c.value);
      assert.ok(cleared.length > 0, "session cookies are cleared");
    });
  } finally {
    stub.restore();
  }
});

test("a Google session on the same account goes through", async () => {
  const stub = stubSupabase();
  try {
    await withFlag("true", async () => {
      const { updateSession } = await import("@/lib/supabase/middleware");
      const response = await updateSession(sessionRequest("/super-admin", ["oauth"]));
      assert.equal(response.headers.get("location"), null);
      assert.equal(stub.logouts(), 0);
    });
  } finally {
    stub.restore();
  }
});

test("with Google sign-in off, password sessions work again (escape hatch)", async () => {
  const stub = stubSupabase();
  try {
    await withFlag(undefined, async () => {
      const { updateSession } = await import("@/lib/supabase/middleware");
      const response = await updateSession(sessionRequest("/super-admin", ["password"]));
      assert.equal(response.headers.get("location"), null);
      assert.equal(stub.logouts(), 0);
    });
  } finally {
    stub.restore();
  }
});

test("a Google sign-in returned to the Site URL is forwarded to the callback", async () => {
  const { updateSession } = await import("@/lib/supabase/middleware");

  const request = new NextRequest(`${SITE}/?code=abc123`);
  request.cookies.set("ams_google_signin", "next=&app=");
  const response = await updateSession(request);
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location")!);
  assert.equal(location.pathname, "/auth/callback");
  assert.equal(location.searchParams.get("code"), "abc123");

  // Without the intent cookie the landing page is left alone.
  const stray = await updateSession(new NextRequest(`${SITE}/?code=abc123`));
  assert.equal(stray.headers.get("location"), null);
});
